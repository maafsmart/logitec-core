import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { logActivity, type LogActivityInput } from "../activity/activity-log.service.js";
import { InventoryMutationError } from "./inventory-errors.js";
import {
  assignmentFromInventory,
  inboundAssignmentFields,
  outboundAssignmentFields,
  resolveInboundAssignment,
  sameAssignmentFields,
  type InventoryAssignment
} from "./inventory-assignment.js";
import { assertNoSerialAmbiguity } from "./inventory-serial-guard.js";

export { InventoryMutationError } from "./inventory-errors.js";

type MutationType = "IN" | "OUT" | "ADJUST_SET" | "PICK" | "RELOCATE";

export type RelocateAllocationMode = "FIFO";

export type InventoryMutationInput = {
  type: MutationType;
  productId: string;
  locationId?: string;
  destinationLocationId?: string;
  status?: string;
  inventoryId?: string;
  layerId?: string;
  allocationMode?: RelocateAllocationMode;
  serialIds?: string[];
  qty: Prisma.Decimal;
  reference?: string | null;
  notes?: string | null;
  taskId?: string | null;
  userId: string;
  lotNumber?: string | null;
  unitPriceMxn?: Prisma.Decimal | null;
  unitPriceUsd?: Prisma.Decimal | null;
  scannedCode?: string | null;
  assignmentType?: "PROJECT" | "FREE_TO_SALE";
  projectId?: string | null;
  clientId?: string | null;
  activity: LogActivityInput;
};

type LockedInventory = NonNullable<Awaited<ReturnType<typeof lockInventory>>>;

function activityMetadata(input: LogActivityInput, extra: Record<string, Prisma.InputJsonValue>) {
  const base =
    input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
      ? (input.metadata as Record<string, Prisma.InputJsonValue>)
      : {};
  return { ...base, ...extra };
}

export type FifoLayerShape = {
  id: string;
  lotNumber: string | null;
  qty: Prisma.Decimal;
  reservedQty: Prisma.Decimal;
  receivedAt: Date | null;
  createdAt: Date;
  unitPriceMxn: Prisma.Decimal | null;
  unitPriceUsd: Prisma.Decimal | null;
  sourceReference: string | null;
};

export function effectiveFifoDate(layer: { receivedAt: Date | null; createdAt: Date }): Date {
  return layer.receivedAt ?? layer.createdAt;
}

export function compareFifoLayers(
  a: { id: string; receivedAt: Date | null; createdAt: Date },
  b: { id: string; receivedAt: Date | null; createdAt: Date }
) {
  const aEffective = effectiveFifoDate(a).getTime();
  const bEffective = effectiveFifoDate(b).getTime();
  if (aEffective !== bEffective) return aEffective - bEffective;
  const aCreated = a.createdAt.getTime();
  const bCreated = b.createdAt.getTime();
  if (aCreated !== bCreated) return aCreated - bCreated;
  return a.id.localeCompare(b.id);
}

export function fifoAvailableLayers<T extends FifoLayerShape>(layers: T[]) {
  return layers
    .map((layer) => ({ layer, availableQty: relocateUnreserved(layer.qty, layer.reservedQty) }))
    .filter(({ availableQty }) => availableQty.greaterThan(0))
    .sort((a, b) => compareFifoLayers(a.layer, b.layer));
}

export function toFifoLayerCandidate(layer: FifoLayerShape, availableQty: Prisma.Decimal, fifoRecommended: boolean) {
  return {
    layerId: layer.id,
    lotNumber: layer.lotNumber,
    qty: layer.qty.toString(),
    reservedQty: layer.reservedQty.toString(),
    availableQty: availableQty.toString(),
    receivedAt: layer.receivedAt,
    createdAt: layer.createdAt,
    sourceReference: layer.sourceReference ?? null,
    unitPriceMxn: layer.unitPriceMxn?.toString() ?? null,
    unitPriceUsd: layer.unitPriceUsd?.toString() ?? null,
    fifoRecommended
  };
}

function layerCandidate(layer: FifoLayerShape, availableQty: Prisma.Decimal, fifoRecommended: boolean) {
  return toFifoLayerCandidate(layer, availableQty, fifoRecommended);
}

export async function lockInventory(tx: Prisma.TransactionClient, inventoryId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Inventory" WHERE "id" = ${inventoryId} FOR UPDATE`);
  return tx.inventory.findUnique({
    where: { id: inventoryId },
    include: { location: true, product: true }
  });
}

export async function lockInventories(tx: Prisma.TransactionClient, inventoryIds: string[]) {
  const ids = [...new Set(inventoryIds)].sort();
  for (const id of ids) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Inventory" WHERE "id" = ${id} FOR UPDATE`);
  }
}

export async function ensureInventory(
  tx: Prisma.TransactionClient,
  productId: string,
  locationId: string,
  status: string,
  assignment: InventoryAssignment
): Promise<LockedInventory> {
  const uniqueWhere = {
    productId_locationId_status_assignmentKey: {
      productId,
      locationId,
      status,
      assignmentKey: assignment.assignmentKey
    }
  };
  const existing = await tx.inventory.findUnique({
    where: uniqueWhere,
    include: { location: true, product: true }
  });
  if (existing) {
    if (existing.clientId !== assignment.clientId) {
      throw new InventoryMutationError(
        "CROSS_CLIENT_TRANSFER",
        "No se puede mezclar inventario de otro cliente en este cubo."
      );
    }
    const locked = await lockInventory(tx, existing.id);
    if (!locked) throw new InventoryMutationError("INVENTORY_NOT_FOUND", "Línea de inventario no encontrada.");
    return locked;
  }
  try {
    const created = await tx.inventory.create({
      data: {
        productId,
        locationId,
        status,
        qty: 0,
        reservedQty: 0,
        assignmentType: assignment.assignmentType,
        projectId: assignment.projectId,
        assignmentKey: assignment.assignmentKey,
        clientId: assignment.clientId
      },
      include: { location: true, product: true }
    });
    return created;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const again = await tx.inventory.findUniqueOrThrow({
      where: uniqueWhere,
      include: { location: true, product: true }
    });
    const locked = await lockInventory(tx, again.id);
    if (!locked) throw new InventoryMutationError("INVENTORY_NOT_FOUND", "Línea de inventario no encontrada.");
    return locked;
  }
}

function relocateUnreserved(qty: Prisma.Decimal, reservedQty: Prisma.Decimal) {
  const available = qty.minus(reservedQty);
  return available.lessThan(0) ? new Prisma.Decimal(0) : available;
}

type RelocateFifoLayer = FifoLayerShape;

function compareRelocateFifoLayers(a: FifoLayerShape, b: FifoLayerShape) {
  return compareFifoLayers(a, b);
}

export function planRelocateFifoAllocation(layers: RelocateFifoLayer[], requested: Prisma.Decimal) {
  const allocations: Array<{ layer: RelocateFifoLayer; qty: Prisma.Decimal }> = [];
  let remaining = requested;
  for (const layer of [...layers].sort(compareRelocateFifoLayers)) {
    if (remaining.lessThanOrEqualTo(0)) break;
    const available = relocateUnreserved(layer.qty, layer.reservedQty);
    if (available.lessThanOrEqualTo(0)) continue;
    const take = available.lessThan(remaining) ? available : remaining;
    allocations.push({ layer, qty: take });
    remaining = remaining.minus(take);
  }
  return { allocations, remaining };
}

async function lockInventoryLayers(tx: Prisma.TransactionClient, inventoryId: string) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "InventoryLayer" WHERE "inventoryId" = ${inventoryId} ORDER BY "id" FOR UPDATE`
  );
}

async function selectLayer(
  tx: Prisma.TransactionClient,
  inventoryId: string,
  layerId?: string,
  requirePositive = true
) {
  await lockInventoryLayers(tx, inventoryId);
  const layers = await tx.inventoryLayer.findMany({
    where: {
      inventoryId,
      ...(requirePositive ? { qty: { gt: new Prisma.Decimal(0) } } : {})
    }
  });
  const available = requirePositive ? fifoAvailableLayers(layers) : layers.map((layer) => ({
    layer,
    availableQty: layer.qty
  }));
  if (!available.length) {
    throw new InventoryMutationError(
      "NO_LAYER_STOCK",
      requirePositive
        ? "La línea no tiene existencias disponibles (qty − reservado)."
        : "La línea no tiene entradas con saldo."
    );
  }
  if (layerId) {
    const match = available.find((item) => item.layer.id === layerId);
    if (!match) {
      throw new InventoryMutationError("LAYER_NOT_AVAILABLE", "La entrada indicada no tiene saldo disponible.");
    }
    return match.layer;
  }
  if (available.length !== 1) {
    throw new InventoryMutationError(
      "AMBIGUOUS_LAYER",
      "Hay varias entradas con saldo disponible. Elige lote u origen de existencia explícitamente.",
      {
        layers: available.map(({ layer, availableQty }, index) => layerCandidate(layer, availableQty, index === 0))
      }
    );
  }
  return available[0]!.layer;
}

export async function decrementLayerAndParent(
  tx: Prisma.TransactionClient,
  inventoryId: string,
  layerId: string,
  delta: Prisma.Decimal
) {
  const layerRows = await tx.$queryRaw<Array<{ id: string; qty: Prisma.Decimal; reservedQty: Prisma.Decimal }>>`
    UPDATE "InventoryLayer"
    SET qty = qty - ${delta}, "updatedAt" = NOW()
    WHERE id = ${layerId}
      AND qty - "reservedQty" >= ${delta}
      AND qty >= ${delta}
    RETURNING id, qty, "reservedQty"
  `;
  if (!layerRows.length) {
    throw new InventoryMutationError("INSUFFICIENT_STOCK", "Stock insuficiente en la capa seleccionada.");
  }
  const inventoryRows = await tx.$queryRaw<Array<{ id: string; qty: Prisma.Decimal; reservedQty: Prisma.Decimal }>>`
    UPDATE "Inventory"
    SET qty = qty - ${delta}, "updatedAt" = NOW()
    WHERE id = ${inventoryId}
      AND qty - "reservedQty" >= ${delta}
      AND qty >= ${delta}
    RETURNING id, qty, "reservedQty"
  `;
  if (!inventoryRows.length) {
    throw new InventoryMutationError("INSUFFICIENT_STOCK", "Stock insuficiente en la línea de inventario.");
  }
  return { layer: layerRows[0]!, inventory: inventoryRows[0]! };
}

export async function incrementParent(tx: Prisma.TransactionClient, inventoryId: string, delta: Prisma.Decimal) {
  const rows = await tx.$queryRaw<Array<{ id: string; qty: Prisma.Decimal }>>`
    UPDATE "Inventory"
    SET qty = qty + ${delta}, "updatedAt" = NOW()
    WHERE id = ${inventoryId}
    RETURNING id, qty
  `;
  if (!rows.length) throw new InventoryMutationError("INVENTORY_NOT_FOUND", "Línea de inventario no encontrada.");
  return rows[0]!;
}

function sameNullableDecimal(left: Prisma.Decimal | null | undefined, right: Prisma.Decimal | null | undefined) {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return left.equals(right);
}

export function inboundLayerAttributesMatch(
  existing: {
    lotNumber: string | null;
    sourceReference: string | null;
    unitPriceMxn: Prisma.Decimal | null;
    unitPriceUsd: Prisma.Decimal | null;
  },
  incoming: {
    lotNumber: string | null;
    sourceReference: string | null;
    unitPriceMxn: Prisma.Decimal | null;
    unitPriceUsd: Prisma.Decimal | null;
  }
) {
  return (
    (existing.lotNumber ?? null) === (incoming.lotNumber ?? null) &&
    (existing.sourceReference ?? null) === (incoming.sourceReference ?? null) &&
    sameNullableDecimal(existing.unitPriceMxn, incoming.unitPriceMxn) &&
    sameNullableDecimal(existing.unitPriceUsd, incoming.unitPriceUsd)
  );
}

async function incrementLayerQty(tx: Prisma.TransactionClient, layerId: string, delta: Prisma.Decimal) {
  const rows = await tx.$queryRaw<Array<{ id: string; qty: Prisma.Decimal; unitPriceMxn: Prisma.Decimal | null }>>`
    UPDATE "InventoryLayer"
    SET qty = qty + ${delta}, "updatedAt" = NOW()
    WHERE id = ${layerId}
    RETURNING id, qty, "unitPriceMxn"
  `;
  if (!rows.length) throw new InventoryMutationError("LAYER_NOT_AVAILABLE", "La capa destino no existe.");
  return rows[0]!;
}

async function selectOrCreateInboundLayer(
  tx: Prisma.TransactionClient,
  inventoryId: string,
  input: InventoryMutationInput
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "InventoryLayer" WHERE "inventoryId" = ${inventoryId} ORDER BY "id" FOR UPDATE`
  );
  const incoming = {
    lotNumber: input.lotNumber ?? null,
    sourceReference: input.reference ?? null,
    unitPriceMxn: input.unitPriceMxn ?? null,
    unitPriceUsd: input.unitPriceUsd ?? null
  };
  const layers = await tx.inventoryLayer.findMany({
    where: { inventoryId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  const match = layers.find((layer) => inboundLayerAttributesMatch(layer, incoming));
  if (match) {
    const updated = await incrementLayerQty(tx, match.id, input.qty);
    return {
      ...match,
      qty: updated.qty,
      unitPriceMxn: match.unitPriceMxn
    };
  }
  return tx.inventoryLayer.create({
    data: {
      inventoryId,
      qty: input.qty,
      reservedQty: 0,
      lotNumber: incoming.lotNumber,
      receivedAt: new Date(),
      unitPriceMxn: incoming.unitPriceMxn,
      unitPriceUsd: incoming.unitPriceUsd,
      sourceReference: incoming.sourceReference,
      sourceType: "MANUAL_IN"
    }
  });
}

async function runMutation(tx: Prisma.TransactionClient, input: InventoryMutationInput) {
  const status = input.status ?? "AVAILABLE";

  if (input.type === "IN") {
    if (!input.locationId) {
      throw new InventoryMutationError("LOCATION_REQUIRED", "La entrada requiere una ubicación explícita.");
    }
    const product = await tx.product.findUnique({
      where: { id: input.productId },
      select: { id: true, customerId: true, customer: { select: { id: true, clientId: true } } }
    });
    if (!product) throw new InventoryMutationError("PRODUCT_NOT_FOUND", "Producto no encontrado.");
    const assignment = await resolveInboundAssignment(tx, product, {
      assignmentType: input.assignmentType,
      projectId: input.projectId,
      clientId: input.clientId
    });
    const inventory = await ensureInventory(tx, input.productId, input.locationId, status, assignment);
    if (inventory.productId !== input.productId) {
      throw new InventoryMutationError("INVENTORY_PRODUCT_MISMATCH", "La línea no corresponde al producto.");
    }
    const before = inventory.qty;
    const layer = await selectOrCreateInboundLayer(tx, inventory.id, input);
    const updatedParent = await incrementParent(tx, inventory.id, input.qty);
    const movement = await tx.inventoryMovement.create({
      data: {
        productId: input.productId,
        type: "INBOUND",
        movementType: "IN",
        stockStatus: status,
        qty: input.qty,
        warehouse: inventory.location.warehouse,
        toLocationId: inventory.locationId,
        inventoryLayerId: layer.id,
        quantityBefore: before,
        quantityAfter: updatedParent.qty,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        userId: input.userId,
        taskId: input.taskId ?? null,
        ...inboundAssignmentFields(assignment)
      }
    });
    await logActivity(
      {
        ...input.activity,
        productId: input.productId,
        customerId: inventory.projectId,
        clientId: assignment.clientId,
        warehouse: inventory.location.warehouse,
        location: inventory.location.code,
        qty: input.qty,
        metadata: activityMetadata(input.activity, {
          inventoryId: inventory.id,
          layerId: layer.id,
          movementId: movement.id
        })
      },
      tx
    );
    return { inventory: updatedParent, layer, movement, before, after: updatedParent.qty, scanEvent: null };
  }

  if (input.type === "RELOCATE") {
    if (!input.inventoryId) {
      throw new InventoryMutationError("INVENTORY_REQUIRED", "La reubicación requiere inventoryId origen.");
    }
    if (!input.destinationLocationId) {
      throw new InventoryMutationError("DESTINATION_REQUIRED", "La reubicación requiere ubicación destino.");
    }
    if (input.qty.lessThanOrEqualTo(0)) {
      throw new InventoryMutationError("INVALID_QTY", "La cantidad de reubicación debe ser mayor a 0.");
    }

    const source = await lockInventory(tx, input.inventoryId);
    if (!source || source.productId !== input.productId) {
      throw new InventoryMutationError("INVENTORY_NOT_FOUND", "Línea de inventario origen no encontrada.");
    }
    if (source.locationId === input.destinationLocationId) {
      throw new InventoryMutationError("SAME_LOCATION", "Origen y destino deben ser distintos.");
    }

    const sourceAssignment = assignmentFromInventory(source);
    const destination = await ensureInventory(
      tx,
      input.productId,
      input.destinationLocationId,
      source.status,
      sourceAssignment
    );
    if (
      destination.assignmentType !== sourceAssignment.assignmentType ||
      destination.projectId !== sourceAssignment.projectId ||
      destination.assignmentKey !== sourceAssignment.assignmentKey
    ) {
      throw new InventoryMutationError(
        "ASSIGNMENT_MISMATCH",
        "La reubicación no puede cambiar la asignación del inventario."
      );
    }
    await lockInventories(tx, [source.id, destination.id]);

    const sourceFresh = await lockInventory(tx, source.id);
    const destFresh = await lockInventory(tx, destination.id);
    if (!sourceFresh || !destFresh) {
      throw new InventoryMutationError("INVENTORY_NOT_FOUND", "No se pudieron bloquear las líneas de reubicación.");
    }

    const layerId = input.layerId?.trim() || "";
    const allocationMode = input.allocationMode ? String(input.allocationMode).trim() : "";
    if (layerId && allocationMode) {
      throw new InventoryMutationError(
        "LAYER_ALLOCATION_CONFLICT",
        "No se puede indicar layerId y allocationMode al mismo tiempo."
      );
    }
    if (allocationMode && allocationMode !== "FIFO") {
      throw new InventoryMutationError("INVALID_ALLOCATION_MODE", "allocationMode debe ser FIFO.");
    }

    const serialIds = (Array.isArray(input.serialIds) ? input.serialIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean);
    if (serialIds.length) {
      if (!input.qty.isInteger()) {
        throw new InventoryMutationError("SERIAL_QTY_NOT_INTEGER", "La cantidad serializada debe ser un entero.");
      }
      if (serialIds.length !== Number(input.qty)) {
        throw new InventoryMutationError(
          "SERIAL_COUNT_MISMATCH",
          "La cantidad de series seleccionadas no coincide con la cantidad a reubicar."
        );
      }
      if (new Set(serialIds).size !== serialIds.length) {
        throw new InventoryMutationError("SERIAL_DUPLICATE", "Hay series duplicadas en la selección.");
      }

      const sortedSerialIds = [...serialIds].sort();
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "InventorySerial" WHERE "id" IN (${Prisma.join(
          sortedSerialIds
        )}) ORDER BY "id" FOR UPDATE`
      );
      const serials = await tx.inventorySerial.findMany({
        where: { id: { in: sortedSerialIds } },
        select: {
          id: true,
          productId: true,
          clientId: true,
          inventoryLayerId: true,
          serialNumber: true,
          imei: true
        }
      });
      if (serials.length !== sortedSerialIds.length) {
        throw new InventoryMutationError("SERIAL_NOT_FOUND", "Una o más series seleccionadas no existen.");
      }
      const sourceLayerIds = [...new Set(serials.map((serial) => serial.inventoryLayerId).filter(Boolean))] as string[];
      if (sourceLayerIds.length === 0 || serials.some((serial) => !serial.inventoryLayerId)) {
        throw new InventoryMutationError("SERIAL_NOT_IN_STOCK", "Una o más series ya no están en inventario.");
      }
      const sourceLayers = await tx.inventoryLayer.findMany({
        where: { id: { in: sourceLayerIds } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      });
      const sourceLayerById = new Map(sourceLayers.map((layer) => [layer.id, layer]));
      for (const serial of serials) {
        const sourceLayer = serial.inventoryLayerId ? sourceLayerById.get(serial.inventoryLayerId) : null;
        if (
          serial.productId !== input.productId ||
          serial.clientId !== sourceAssignment.clientId ||
          !sourceLayer ||
          sourceLayer.inventoryId !== sourceFresh.id
        ) {
          throw new InventoryMutationError(
            "SERIAL_SOURCE_MISMATCH",
            "Una o más series no pertenecen al saldo origen seleccionado."
          );
        }
      }

      const inventoryAvailable = relocateUnreserved(sourceFresh.qty, sourceFresh.reservedQty);
      if (inventoryAvailable.lessThan(input.qty)) {
        throw new InventoryMutationError("INSUFFICIENT_STOCK", "La línea origen no tiene saldo suficiente no reservado.");
      }

      const before = sourceFresh.qty;
      let runningBefore = before;
      let firstDestLayer: { id: string } | null = null;
      let firstMovement: { id: string } | null = null;
      let destAfter: { id: string; qty: Prisma.Decimal } | null = null;
      const serialAudit: Prisma.InputJsonValue[] = [];

      for (const sourceLayer of sourceLayers) {
        const layerSerials = serials
          .filter((serial) => serial.inventoryLayerId === sourceLayer.id)
          .sort((a, b) => a.id.localeCompare(b.id));
        if (!layerSerials.length) continue;
        const layerQty = new Prisma.Decimal(layerSerials.length);
        const layerAvailable = relocateUnreserved(sourceLayer.qty, sourceLayer.reservedQty);
        if (layerAvailable.lessThan(layerQty)) {
          throw new InventoryMutationError(
            "INSUFFICIENT_STOCK",
            "La capa de una serie seleccionada no tiene saldo suficiente no reservado."
          );
        }

        await decrementLayerAndParent(tx, sourceFresh.id, sourceLayer.id, layerQty);
        const destLayer = await tx.inventoryLayer.create({
          data: {
            inventoryId: destFresh.id,
            lotNumber: sourceLayer.lotNumber,
            qty: layerQty,
            reservedQty: 0,
            receivedAt: sourceLayer.receivedAt,
            unitPriceMxn: sourceLayer.unitPriceMxn,
            unitPriceUsd: sourceLayer.unitPriceUsd,
            sourceReference: sourceLayer.sourceReference ?? input.reference ?? null,
            sourceType: "RELOCATION"
          }
        });
        destAfter = await incrementParent(tx, destFresh.id, layerQty);
        if (!firstDestLayer) firstDestLayer = destLayer;

        const moved = await tx.inventorySerial.updateMany({
          where: { id: { in: layerSerials.map((serial) => serial.id) }, inventoryLayerId: sourceLayer.id },
          data: { inventoryLayerId: destLayer.id }
        });
        if (moved.count !== layerSerials.length) {
          throw new InventoryMutationError(
            "SERIAL_CONCURRENT_CHANGE",
            "Una serie cambió de ubicación durante la reubicación; no se aplicó ningún cambio."
          );
        }

        for (const serial of layerSerials) {
          const afterEach = runningBefore.minus(1);
          const movement = await tx.inventoryMovement.create({
            data: {
              productId: input.productId,
              type: "RELOCATE",
              movementType: "RELOCATE",
              stockStatus: sourceFresh.status,
              qty: new Prisma.Decimal(1),
              warehouse: sourceFresh.location.warehouse,
              fromLocationId: sourceFresh.locationId,
              toLocationId: destFresh.locationId,
              inventoryLayerId: destLayer.id,
              inventorySerialId: serial.id,
              quantityBefore: runningBefore,
              quantityAfter: afterEach,
              reference: input.reference ?? null,
              notes: input.notes ?? null,
              userId: input.userId,
              taskId: input.taskId ?? null,
              ...sameAssignmentFields(sourceAssignment)
            }
          });
          if (!firstMovement) firstMovement = movement;
          runningBefore = afterEach;
          serialAudit.push({
            serialId: serial.id,
            serialNumber: serial.serialNumber,
            imei: serial.imei,
            sourceLayerId: sourceLayer.id,
            destinationLayerId: destLayer.id
          });
        }
      }

      const sourceAfter = await tx.inventory.findUniqueOrThrow({ where: { id: sourceFresh.id } });
      if (!firstMovement || !firstDestLayer) {
        throw new InventoryMutationError("SERIAL_NOT_FOUND", "No se encontraron series válidas para reubicar.");
      }
      await logActivity(
        {
          ...input.activity,
          productId: input.productId,
          customerId: sourceFresh.projectId,
          clientId: sourceAssignment.clientId,
          warehouse: sourceFresh.location.warehouse,
          location: `${sourceFresh.location.code} → ${destFresh.location.code}`,
          qty: input.qty,
          metadata: activityMetadata(input.activity, {
            inventoryId: sourceFresh.id,
            destinationInventoryId: destFresh.id,
            serialIds: sortedSerialIds,
            serials: serialAudit,
            movementId: firstMovement.id
          })
        },
        tx
      );
      return {
        inventory: sourceAfter,
        layer: firstDestLayer,
        movement: firstMovement,
        before,
        after: sourceAfter.qty,
        destinationInventory: destAfter,
        scanEvent: null
      };
    }

    if (allocationMode === "FIFO") {
      await lockInventoryLayers(tx, sourceFresh.id);
      const sourceReloaded = await lockInventory(tx, sourceFresh.id);
      const destReloaded = await lockInventory(tx, destFresh.id);
      if (!sourceReloaded || !destReloaded) {
        throw new InventoryMutationError("INVENTORY_NOT_FOUND", "No se pudieron releer las líneas de reubicación.");
      }
      if (sourceReloaded.locationId === destReloaded.locationId) {
        throw new InventoryMutationError("SAME_LOCATION", "Origen y destino deben ser distintos.");
      }
      const inventoryAvailable = relocateUnreserved(sourceReloaded.qty, sourceReloaded.reservedQty);
      if (inventoryAvailable.lessThan(input.qty)) {
        throw new InventoryMutationError("INSUFFICIENT_STOCK", "La línea origen no tiene saldo suficiente no reservado.");
      }

      const layers = await tx.inventoryLayer.findMany({ where: { inventoryId: sourceReloaded.id } });
      const planned = planRelocateFifoAllocation(layers, input.qty);
      if (planned.remaining.greaterThan(0) || !planned.allocations.length) {
        throw new InventoryMutationError("INSUFFICIENT_STOCK", "Las capas origen no tienen saldo suficiente no reservado.");
      }

      for (const slice of planned.allocations) {
        await assertNoSerialAmbiguity(tx, slice.layer.id);
      }

      const before = sourceReloaded.qty;
      const allocationAudit: Prisma.InputJsonValue[] = [];
      let firstDestLayer: { id: string } | null = null;
      let destAfter: { id: string; qty: Prisma.Decimal } | null = null;
      for (const slice of planned.allocations) {
        await decrementLayerAndParent(tx, sourceReloaded.id, slice.layer.id, slice.qty);
        const destLayer = await tx.inventoryLayer.create({
          data: {
            inventoryId: destReloaded.id,
            lotNumber: slice.layer.lotNumber,
            qty: slice.qty,
            reservedQty: 0,
            receivedAt: slice.layer.receivedAt,
            unitPriceMxn: slice.layer.unitPriceMxn,
            unitPriceUsd: slice.layer.unitPriceUsd,
            sourceReference: slice.layer.sourceReference,
            sourceType: "RELOCATION"
          }
        });
        destAfter = await incrementParent(tx, destReloaded.id, slice.qty);
        if (!firstDestLayer) firstDestLayer = destLayer;
        allocationAudit.push({
          sourceLayerId: slice.layer.id,
          destinationLayerId: destLayer.id,
          qty: slice.qty.toString(),
          lotNumber: slice.layer.lotNumber,
          unitPriceMxn: slice.layer.unitPriceMxn == null ? null : slice.layer.unitPriceMxn.toString(),
          unitPriceUsd: slice.layer.unitPriceUsd == null ? null : slice.layer.unitPriceUsd.toString(),
          receivedAt: slice.layer.receivedAt ? slice.layer.receivedAt.toISOString() : null,
          sourceReference: slice.layer.sourceReference
        });
      }
      const sourceAfter = await tx.inventory.findUniqueOrThrow({ where: { id: sourceReloaded.id } });
      const movement = await tx.inventoryMovement.create({
        data: {
          productId: input.productId,
          type: "RELOCATE",
          movementType: "RELOCATE",
          stockStatus: sourceReloaded.status,
          qty: input.qty,
          warehouse: sourceReloaded.location.warehouse,
          fromLocationId: sourceReloaded.locationId,
          toLocationId: destReloaded.locationId,
          inventoryLayerId: firstDestLayer?.id,
          quantityBefore: before,
          quantityAfter: sourceAfter.qty,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          userId: input.userId,
          taskId: input.taskId ?? null,
          ...sameAssignmentFields(sourceAssignment)
        }
      });
      await logActivity(
        {
          ...input.activity,
          productId: input.productId,
          customerId: sourceReloaded.projectId,
          clientId: sourceAssignment.clientId,
          warehouse: sourceReloaded.location.warehouse,
          location: `${sourceReloaded.location.code} → ${destReloaded.location.code}`,
          qty: input.qty,
          metadata: activityMetadata(input.activity, {
            inventoryId: sourceReloaded.id,
            destinationInventoryId: destReloaded.id,
            allocationMode: "FIFO",
            allocations: allocationAudit,
            movementId: movement.id
          })
        },
        tx
      );
      return {
        inventory: sourceAfter,
        layer: firstDestLayer,
        movement,
        before,
        after: sourceAfter.qty,
        destinationInventory: destAfter,
        scanEvent: null
      };
    }

    const sourceLayer = await selectLayer(tx, sourceFresh.id, layerId || undefined);
    await assertNoSerialAmbiguity(tx, sourceLayer.id);
    if (sourceLayer.qty.lessThan(input.qty)) {
      throw new InventoryMutationError("INSUFFICIENT_STOCK", "La capa origen no tiene saldo suficiente.");
    }

    const before = sourceFresh.qty;
    await decrementLayerAndParent(tx, sourceFresh.id, sourceLayer.id, input.qty);

    const destLayer = await tx.inventoryLayer.create({
      data: {
        inventoryId: destFresh.id,
        lotNumber: sourceLayer.lotNumber,
        qty: input.qty,
        reservedQty: 0,
        receivedAt: sourceLayer.receivedAt,
        unitPriceMxn: sourceLayer.unitPriceMxn,
        unitPriceUsd: sourceLayer.unitPriceUsd,
        sourceReference: sourceLayer.sourceReference ?? input.reference ?? null,
        sourceType: "RELOCATION"
      }
    });
    const destAfter = await incrementParent(tx, destFresh.id, input.qty);
    const sourceAfter = await tx.inventory.findUniqueOrThrow({ where: { id: sourceFresh.id } });

    const movement = await tx.inventoryMovement.create({
      data: {
        productId: input.productId,
        type: "RELOCATE",
        movementType: "RELOCATE",
        stockStatus: sourceFresh.status,
        qty: input.qty,
        warehouse: sourceFresh.location.warehouse,
        fromLocationId: sourceFresh.locationId,
        toLocationId: destFresh.locationId,
        inventoryLayerId: destLayer.id,
        quantityBefore: before,
        quantityAfter: sourceAfter.qty,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        userId: input.userId,
        taskId: input.taskId ?? null,
        ...sameAssignmentFields(sourceAssignment)
      }
    });
    await logActivity(
      {
        ...input.activity,
        productId: input.productId,
        customerId: sourceFresh.projectId,
        clientId: sourceAssignment.clientId,
        warehouse: sourceFresh.location.warehouse,
        location: `${sourceFresh.location.code} → ${destFresh.location.code}`,
        qty: input.qty,
        metadata: activityMetadata(input.activity, {
          inventoryId: sourceFresh.id,
          destinationInventoryId: destFresh.id,
          sourceLayerId: sourceLayer.id,
          destinationLayerId: destLayer.id,
          movementId: movement.id
        })
      },
      tx
    );
    return {
      inventory: sourceAfter,
      layer: destLayer,
      movement,
      before,
      after: sourceAfter.qty,
      destinationInventory: destAfter,
      scanEvent: null
    };
  }

  if (!input.inventoryId) {
    throw new InventoryMutationError("INVENTORY_REQUIRED", "La operación requiere una línea de inventario explícita.");
  }
  const inventory = await lockInventory(tx, input.inventoryId);
  if (!inventory || inventory.productId !== input.productId) {
    throw new InventoryMutationError("INVENTORY_PRODUCT_MISMATCH", "La línea no corresponde al producto.");
  }

  const statusDefinition = await tx.inventoryStatusDefinition.findUnique({ where: { code: inventory.status } });
  if (input.type === "PICK" && statusDefinition?.pickable === false) {
    throw new InventoryMutationError("STATUS_NOT_PICKABLE", "El estado de inventario no permite surtir.");
  }

  const layer = await selectLayer(tx, inventory.id, input.layerId, input.type !== "ADJUST_SET");
  await assertNoSerialAmbiguity(tx, layer.id);

  if (input.type === "ADJUST_SET") {
    const allLayers = await tx.inventoryLayer.findMany({ where: { inventoryId: inventory.id } });
    if (allLayers.length > 1 && !input.layerId) {
      throw new InventoryMutationError(
        "AMBIGUOUS_LAYER",
        "El ajuste requiere layerId cuando existen varias capas.",
        {
          layers: fifoAvailableLayers(allLayers.filter((l) => l.qty.greaterThan(0))).map(({ layer, availableQty }, index) =>
            layerCandidate(layer, availableQty, index === 0)
          )
        }
      );
    }
    const target = input.qty;
    if (target.lessThan(0)) {
      throw new InventoryMutationError("INVALID_QTY", "El ajuste no puede ser negativo.");
    }
    const delta = target.minus(inventory.qty);
    const layerAfter = layer.qty.plus(delta);
    if (layerAfter.lessThan(0) || layerAfter.lessThan(layer.reservedQty) || target.lessThan(inventory.reservedQty)) {
      throw new InventoryMutationError("RESERVE_VIOLATION", "El ajuste dejaría qty < reservedQty.");
    }
    const updatedLayer = await tx.inventoryLayer.update({ where: { id: layer.id }, data: { qty: layerAfter } });
    const updated = await tx.inventory.update({ where: { id: inventory.id }, data: { qty: target } });
    const movement = await tx.inventoryMovement.create({
      data: {
        productId: input.productId,
        type: "ADJUSTMENT",
        movementType: "ADJUST_SET",
        stockStatus: inventory.status,
        qty: target,
        warehouse: inventory.location.warehouse,
        toLocationId: inventory.locationId,
        inventoryLayerId: layer.id,
        quantityBefore: inventory.qty,
        quantityAfter: target,
        reference: input.reference ?? null,
        notes: input.notes ?? null,
        userId: input.userId,
        taskId: input.taskId ?? null,
        ...sameAssignmentFields(assignmentFromInventory(inventory))
      }
    });
    await logActivity(
      {
        ...input.activity,
        productId: input.productId,
        customerId: inventory.projectId,
        clientId: inventory.clientId,
        warehouse: inventory.location.warehouse,
        location: inventory.location.code,
        qty: input.qty,
        metadata: activityMetadata(input.activity, {
          inventoryId: inventory.id,
          layerId: layer.id,
          movementId: movement.id
        })
      },
      tx
    );
    return { inventory: updated, layer: updatedLayer, movement, before: inventory.qty, after: target, scanEvent: null };
  }

  // OUT / PICK
  const before = inventory.qty;
  const result = await decrementLayerAndParent(tx, inventory.id, layer.id, input.qty);
  const movement = await tx.inventoryMovement.create({
    data: {
      productId: input.productId,
      type: input.type === "PICK" ? "PICK" : "OUTBOUND",
      movementType: "OUT",
      stockStatus: inventory.status,
      qty: input.qty,
      warehouse: inventory.location.warehouse,
      fromLocationId: inventory.locationId,
      inventoryLayerId: layer.id,
      quantityBefore: before,
      quantityAfter: result.inventory.qty,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      userId: input.userId,
      taskId: input.taskId ?? null,
      ...outboundAssignmentFields(assignmentFromInventory(inventory))
    }
  });
  const scanEvent = input.scannedCode
    ? await tx.scanEvent.create({
        data: {
          scannedCode: input.scannedCode,
          result: "OK",
          userId: input.userId,
          productId: input.productId,
          warehouse: inventory.location.warehouse,
          location: inventory.location.code,
          taskId: input.taskId ?? null,
          clientId: inventory.clientId
        }
      })
    : null;
  await logActivity(
    {
      ...input.activity,
      productId: input.productId,
      customerId: inventory.projectId,
      clientId: inventory.clientId,
      warehouse: inventory.location.warehouse,
      location: inventory.location.code,
      qty: input.qty,
      metadata: activityMetadata(input.activity, {
        inventoryId: inventory.id,
        layerId: layer.id,
        movementId: movement.id,
        scanEventId: scanEvent?.id ?? ""
      })
    },
    tx
  );
  return {
    inventory: result.inventory,
    layer: result.layer,
    movement,
    before,
    after: result.inventory.qty,
    scanEvent
  };
}

export async function mutateInventoryInTransaction(tx: Prisma.TransactionClient, input: InventoryMutationInput) {
  return runMutation(tx, input);
}

export async function mutateInventory(input: InventoryMutationInput) {
  return prisma.$transaction((tx) => mutateInventoryInTransaction(tx, input), { maxWait: 5_000, timeout: 15_000 });
}
