import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { logActivity, type LogActivityInput } from "../activity/activity-log.service.js";

export class InventoryMutationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
  }
}

type MutationType = "IN" | "OUT" | "ADJUST_SET" | "PICK" | "RELOCATE";

export type InventoryMutationInput = {
  type: MutationType;
  productId: string;
  locationId?: string;
  destinationLocationId?: string;
  status?: string;
  inventoryId?: string;
  layerId?: string;
  qty: Prisma.Decimal;
  reference?: string | null;
  notes?: string | null;
  taskId?: string | null;
  userId: string;
  lotNumber?: string | null;
  unitPriceMxn?: Prisma.Decimal | null;
  unitPriceUsd?: Prisma.Decimal | null;
  scannedCode?: string | null;
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

function layerCandidate(layer: {
  id: string;
  lotNumber: string | null;
  qty: Prisma.Decimal;
  reservedQty: Prisma.Decimal;
  receivedAt: Date | null;
  unitPriceMxn: Prisma.Decimal | null;
  unitPriceUsd: Prisma.Decimal | null;
}) {
  return {
    layerId: layer.id,
    lotNumber: layer.lotNumber,
    qty: layer.qty.toString(),
    reservedQty: layer.reservedQty.toString(),
    receivedAt: layer.receivedAt,
    unitPriceMxn: layer.unitPriceMxn?.toString() ?? null,
    unitPriceUsd: layer.unitPriceUsd?.toString() ?? null
  };
}

async function lockInventory(tx: Prisma.TransactionClient, inventoryId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Inventory" WHERE "id" = ${inventoryId} FOR UPDATE`);
  return tx.inventory.findUnique({
    where: { id: inventoryId },
    include: { location: true, product: true }
  });
}

async function lockInventories(tx: Prisma.TransactionClient, inventoryIds: string[]) {
  const ids = [...new Set(inventoryIds)].sort();
  for (const id of ids) {
    await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "Inventory" WHERE "id" = ${id} FOR UPDATE`);
  }
}

async function ensureInventory(
  tx: Prisma.TransactionClient,
  productId: string,
  locationId: string,
  status: string
): Promise<LockedInventory> {
  const existing = await tx.inventory.findUnique({
    where: { productId_locationId_status: { productId, locationId, status } },
    include: { location: true, product: true }
  });
  if (existing) {
    await lockInventory(tx, existing.id);
    const locked = await lockInventory(tx, existing.id);
    if (!locked) throw new InventoryMutationError("INVENTORY_NOT_FOUND", "Línea de inventario no encontrada.");
    return locked;
  }
  try {
    const created = await tx.inventory.create({
      data: { productId, locationId, status, qty: 0, reservedQty: 0 },
      include: { location: true, product: true }
    });
    return created;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const again = await tx.inventory.findUniqueOrThrow({
      where: { productId_locationId_status: { productId, locationId, status } },
      include: { location: true, product: true }
    });
    const locked = await lockInventory(tx, again.id);
    if (!locked) throw new InventoryMutationError("INVENTORY_NOT_FOUND", "Línea de inventario no encontrada.");
    return locked;
  }
}

async function selectLayer(
  tx: Prisma.TransactionClient,
  inventoryId: string,
  layerId?: string,
  requirePositive = true
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "InventoryLayer" WHERE "inventoryId" = ${inventoryId} ORDER BY "id" FOR UPDATE`
  );
  const layers = await tx.inventoryLayer.findMany({
    where: {
      inventoryId,
      ...(requirePositive ? { qty: { gt: new Prisma.Decimal(0) } } : {})
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  if (!layers.length) throw new InventoryMutationError("NO_LAYER_STOCK", "La línea no tiene capas con saldo.");
  if (layerId) {
    const layer = layers.find((item) => item.id === layerId);
    if (!layer) throw new InventoryMutationError("LAYER_NOT_AVAILABLE", "La capa indicada no tiene saldo disponible.");
    return layer;
  }
  if (layers.length !== 1) {
    throw new InventoryMutationError(
      "AMBIGUOUS_LAYER",
      "La línea tiene varias capas con saldo. Selecciona capa o lote explícitamente.",
      { layers: layers.map(layerCandidate) }
    );
  }
  return layers[0]!;
}

async function assertNoSerialAmbiguity(tx: Prisma.TransactionClient, layerId: string) {
  const serialCount = await tx.inventorySerial.count({ where: { inventoryLayerId: layerId } });
  if (serialCount > 0) {
    throw new InventoryMutationError(
      "SERIAL_SELECTION_REQUIRED",
      "La capa contiene series; requiere selección explícita de seriales."
    );
  }
}

async function decrementLayerAndParent(
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

async function incrementParent(tx: Prisma.TransactionClient, inventoryId: string, delta: Prisma.Decimal) {
  const rows = await tx.$queryRaw<Array<{ id: string; qty: Prisma.Decimal }>>`
    UPDATE "Inventory"
    SET qty = qty + ${delta}, "updatedAt" = NOW()
    WHERE id = ${inventoryId}
    RETURNING id, qty
  `;
  if (!rows.length) throw new InventoryMutationError("INVENTORY_NOT_FOUND", "Línea de inventario no encontrada.");
  return rows[0]!;
}

async function runMutation(tx: Prisma.TransactionClient, input: InventoryMutationInput) {
  const status = input.status ?? "AVAILABLE";

  if (input.type === "IN") {
    if (!input.locationId) {
      throw new InventoryMutationError("LOCATION_REQUIRED", "La entrada requiere una ubicación explícita.");
    }
    const inventory = await ensureInventory(tx, input.productId, input.locationId, status);
    if (inventory.productId !== input.productId) {
      throw new InventoryMutationError("INVENTORY_PRODUCT_MISMATCH", "La línea no corresponde al producto.");
    }
    const before = inventory.qty;
    const layer = await tx.inventoryLayer.create({
      data: {
        inventoryId: inventory.id,
        qty: input.qty,
        reservedQty: 0,
        lotNumber: input.lotNumber ?? null,
        receivedAt: new Date(),
        unitPriceMxn: input.unitPriceMxn ?? null,
        unitPriceUsd: input.unitPriceUsd ?? null,
        sourceReference: input.reference ?? null,
        sourceType: "MANUAL_IN"
      }
    });
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
        taskId: input.taskId ?? null
      }
    });
    await logActivity(
      {
        ...input.activity,
        productId: input.productId,
        customerId: inventory.product.customerId,
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

    const destination = await ensureInventory(tx, input.productId, input.destinationLocationId, source.status);
    await lockInventories(tx, [source.id, destination.id]);

    const sourceFresh = await lockInventory(tx, source.id);
    const destFresh = await lockInventory(tx, destination.id);
    if (!sourceFresh || !destFresh) {
      throw new InventoryMutationError("INVENTORY_NOT_FOUND", "No se pudieron bloquear las líneas de reubicación.");
    }

    const sourceLayer = await selectLayer(tx, sourceFresh.id, input.layerId);
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
        taskId: input.taskId ?? null
      }
    });
    await logActivity(
      {
        ...input.activity,
        productId: input.productId,
        customerId: sourceFresh.product.customerId,
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
        { layers: allLayers.filter((l) => l.qty.greaterThan(0)).map(layerCandidate) }
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
        taskId: input.taskId ?? null
      }
    });
    await logActivity(
      {
        ...input.activity,
        productId: input.productId,
        customerId: inventory.product.customerId,
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
      taskId: input.taskId ?? null
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
          taskId: input.taskId ?? null
        }
      })
    : null;
  await logActivity(
    {
      ...input.activity,
      productId: input.productId,
      customerId: inventory.product.customerId,
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

export async function mutateInventory(input: InventoryMutationInput) {
  return prisma.$transaction((tx) => runMutation(tx, input), { maxWait: 5_000, timeout: 15_000 });
}
