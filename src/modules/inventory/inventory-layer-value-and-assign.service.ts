import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { logActivity } from "../activity/activity-log.service.js";
import { calculateInventoryValuation } from "./inventory-valuation.service.js";
import { LayerPriceError, parseLayerUnitPriceMxn } from "./inventory-layer-price.service.js";
import { parseLayerQtyToValue, splitUnpricedInventoryLayerPrice } from "./inventory-layer-price-split.service.js";
import {
  assignmentFromInventory,
  buildAssignment,
  ensureCanonicalProductProject,
  inboundAssignmentFields,
  outboundAssignmentFields,
  type InventoryAssignment
} from "./inventory-assignment.js";
import { InventoryMutationError } from "./inventory-errors.js";
import {
  decrementLayerAndParent,
  ensureInventory,
  incrementParent,
  lockInventories,
  lockInventory
} from "./inventory-mutation.service.js";
import { assertNoSerialAmbiguity } from "./inventory-serial-guard.js";
import { isForbiddenInventoryProjectRecord } from "./inventory-project-rules.js";

const ZERO = new Prisma.Decimal(0);
export const VALUE_ASSIGN_DESTINATION_TYPES = ["KEEP", "FREE_TO_SALE", "PROJECT"] as const;
export type ValueAssignDestinationType = (typeof VALUE_ASSIGN_DESTINATION_TYPES)[number];

type ValueAssignDb = {
  inventoryLayer: { findUnique: typeof prisma.inventoryLayer.findUnique };
  $transaction: <T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number }
  ) => Promise<T>;
};

function asLayerPriceError(error: unknown): never {
  if (error instanceof LayerPriceError) throw error;
  if (error instanceof InventoryMutationError) {
    const status = [
      "SERIAL_SELECTION_REQUIRED",
      "INSUFFICIENT_STOCK",
      "INSUFFICIENT_UNRESERVED_FOR_TRANSFER",
      "LAYER_NOT_AVAILABLE",
      "SAME_ASSIGNMENT",
      "TRANSFER_TOTAL_MISMATCH"
    ].includes(error.code)
      ? 409
      : 400;
    throw new LayerPriceError(error.code, error.message, status);
  }
  throw error;
}

export function parseValueAssignDestinationType(value: unknown): ValueAssignDestinationType {
  const raw = value == null ? "" : String(value).trim().toUpperCase();
  if (!raw) {
    throw new LayerPriceError("DESTINATION_REQUIRED", "Indica el destino de las piezas.");
  }
  if (!VALUE_ASSIGN_DESTINATION_TYPES.includes(raw as ValueAssignDestinationType)) {
    throw new LayerPriceError("INVALID_DESTINATION", "El destino debe ser KEEP, FREE_TO_SALE o PROJECT.");
  }
  return raw as ValueAssignDestinationType;
}

function sameAssignment(left: InventoryAssignment, right: InventoryAssignment) {
  return (
    left.assignmentType === right.assignmentType &&
    left.projectId === right.projectId &&
    left.assignmentKey === right.assignmentKey &&
    left.clientId === right.clientId
  );
}

async function assertDestinationProject(
  tx: Prisma.TransactionClient,
  projectId: string,
  ownerClientId: string
) {
  const project = await tx.customer.findUnique({
    where: { id: projectId },
    select: { id: true, code: true, name: true, active: true, clientId: true }
  });
  if (!project || isForbiddenInventoryProjectRecord(project)) {
    throw new LayerPriceError("PROJECT_NOT_FOUND", "Proyecto destino no encontrado.", 404);
  }
  if (!project.active) {
    throw new LayerPriceError("PROJECT_INACTIVE", "El proyecto destino no está activo.", 409);
  }
  if (project.clientId !== ownerClientId) {
    throw new LayerPriceError(
      "CROSS_CLIENT_TRANSFER",
      "No se puede asignar a un proyecto de otro cliente.",
      409
    );
  }
  return project;
}

async function assertLayerQtyTotal(
  tx: Prisma.TransactionClient,
  inventoryId: string,
  expectedQty: Prisma.Decimal
) {
  const layers = await tx.inventoryLayer.findMany({
    where: { inventoryId },
    select: { qty: true }
  });
  const sum = layers.reduce((acc, layer) => acc.plus(layer.qty), ZERO);
  if (!sum.equals(expectedQty)) {
    throw new LayerPriceError(
      "LAYER_QTY_TOTAL_MISMATCH",
      "La suma de capas no coincide con el saldo del cubo.",
      409
    );
  }
}

function serializeLayer(layer: {
  id: string;
  inventoryId: string;
  qty: Prisma.Decimal;
  reservedQty: Prisma.Decimal;
  lotNumber: string | null;
  unitPriceMxn: Prisma.Decimal | null;
  unitPriceUsd: Prisma.Decimal | null;
}) {
  return {
    id: layer.id,
    inventoryId: layer.inventoryId,
    qty: layer.qty.toString(),
    reservedQty: layer.reservedQty.toString(),
    lotNumber: layer.lotNumber,
    unitPriceMxn: layer.unitPriceMxn?.toString() ?? null,
    unitPriceUsd: layer.unitPriceUsd?.toString() ?? null
  };
}

function serializeAssignment(assignment: InventoryAssignment) {
  return {
    assignmentType: assignment.assignmentType,
    projectId: assignment.projectId,
    assignmentKey: assignment.assignmentKey,
    clientId: assignment.clientId
  };
}

export async function valueAndAssignUnpricedLayer(
  input: {
    layerId: string;
    qtyToValue: unknown;
    unitPriceMxn: unknown;
    destinationType: unknown;
    projectId?: unknown;
    userId: string;
  },
  db: ValueAssignDb = prisma
) {
  const destinationType = parseValueAssignDestinationType(input.destinationType);
  const qtyToValue = parseLayerQtyToValue(input.qtyToValue);
  const price = parseLayerUnitPriceMxn(input.unitPriceMxn);

  const loaded = await db.inventoryLayer.findUnique({
    where: { id: input.layerId },
    include: {
      inventory: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              customerId: true,
              customer: { select: { id: true, clientId: true } }
            }
          },
          location: { select: { id: true, code: true, warehouse: true } },
          project: { select: { id: true, code: true, name: true } }
        }
      }
    }
  });
  if (!loaded) {
    throw new LayerPriceError("LAYER_NOT_FOUND", "Capa de inventario no encontrada.", 404);
  }
  if (loaded.unitPriceMxn != null) {
    throw new LayerPriceError(
      "LAYER_ALREADY_PRICED",
      "Esta capa ya tiene precio. Usa la edición completa de precio.",
      409
    );
  }

  const sourceAssignment = assignmentFromInventory(loaded.inventory);
  let requestedKeep = destinationType === "KEEP";
  let destinationAssignment = sourceAssignment;
  if (destinationType === "FREE_TO_SALE") {
    destinationAssignment = buildAssignment("FREE_TO_SALE", null, sourceAssignment.clientId);
  } else if (destinationType === "PROJECT") {
    const projectId = input.projectId == null ? "" : String(input.projectId).trim();
    if (!projectId) {
      throw new LayerPriceError("PROJECT_REQUIRED", "Selecciona un proyecto destino.");
    }
    destinationAssignment = buildAssignment("PROJECT", projectId, sourceAssignment.clientId);
  }
  if (sameAssignment(sourceAssignment, destinationAssignment)) {
    requestedKeep = true;
  }

  if (requestedKeep) {
    const split = await splitUnpricedInventoryLayerPrice(
      {
        layerId: input.layerId,
        qtyToValue: input.qtyToValue,
        unitPriceMxn: input.unitPriceMxn,
        userId: input.userId
      },
      db
    );
    return {
      ...split,
      assignmentChanged: false,
      movementId: null,
      movementType: null,
      sourceAssignment: serializeAssignment(sourceAssignment),
      destinationAssignment: serializeAssignment(sourceAssignment),
      sourceInventoryId: loaded.inventoryId,
      destinationInventoryId: loaded.inventoryId
    };
  }

  try {
    return await db.$transaction(
      async (tx) => {
        const sourceLocked = await lockInventory(tx, loaded.inventoryId);
        if (!sourceLocked) {
          throw new LayerPriceError("LAYER_CHANGED", "El cubo origen fue modificado por otra operación.", 409);
        }
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "InventoryLayer" WHERE "inventoryId" = ${loaded.inventoryId} ORDER BY "id" FOR UPDATE`
        );
        const layer = await tx.inventoryLayer.findUnique({
          where: { id: loaded.id },
          include: {
            inventory: {
              include: {
                product: {
                  select: {
                    id: true,
                    sku: true,
                    name: true,
                    customerId: true,
                    customer: { select: { id: true, clientId: true } }
                  }
                },
                location: { select: { id: true, code: true, warehouse: true } },
                project: { select: { id: true, code: true, name: true } }
              }
            },
            _count: { select: { serials: true } }
          }
        });
        if (!layer) {
          throw new LayerPriceError("LAYER_CHANGED", "La capa fue modificada por otra operación.", 409);
        }
        if (layer.unitPriceMxn != null) {
          throw new LayerPriceError(
            "LAYER_ALREADY_PRICED",
            "Esta capa ya tiene precio. Usa la edición completa de precio.",
            409
          );
        }
        if (!layer.qty.equals(loaded.qty) || !layer.reservedQty.equals(loaded.reservedQty)) {
          throw new LayerPriceError("LAYER_CHANGED", "La capa fue modificada por otra operación.", 409);
        }
        if (
          layer.inventory.productId !== sourceLocked.productId ||
          layer.inventory.locationId !== sourceLocked.locationId ||
          layer.inventory.status !== sourceLocked.status
        ) {
          throw new LayerPriceError("LAYER_CHANGED", "El cubo origen fue modificado por otra operación.", 409);
        }
        if (qtyToValue.greaterThan(layer.qty)) {
          throw new LayerPriceError(
            "QTY_EXCEEDS_LAYER",
            "La cantidad a valuar no puede superar la cantidad de la capa."
          );
        }
        const unreserved = layer.qty.minus(layer.reservedQty);
        if (qtyToValue.greaterThan(unreserved)) {
          throw new LayerPriceError(
            "QTY_EXCEEDS_UNRESERVED",
            "La cantidad a valuar no puede superar el saldo no reservado."
          );
        }
        await assertNoSerialAmbiguity(tx, layer.id);

        if (destinationAssignment.assignmentType === "PROJECT") {
          await assertDestinationProject(tx, destinationAssignment.projectId!, sourceLocked.clientId);
          await ensureCanonicalProductProject(tx, layer.inventory.product.id, destinationAssignment.projectId);
        }

        const destination = await ensureInventory(
          tx,
          sourceLocked.productId,
          sourceLocked.locationId,
          sourceLocked.status,
          destinationAssignment
        );
        if (
          destination.productId !== sourceLocked.productId ||
          destination.locationId !== sourceLocked.locationId ||
          destination.status !== sourceLocked.status
        ) {
          throw new LayerPriceError(
            "ASSIGNMENT_LOCATION_MISMATCH",
            "La valuación con asignación no puede cambiar producto, ubicación ni estatus.",
            409
          );
        }
        if (destination.id === sourceLocked.id) {
          throw new LayerPriceError("SAME_ASSIGNMENT", "Origen y destino tienen la misma asignación.", 409);
        }

        await lockInventories(tx, [sourceLocked.id, destination.id]);
        const sourceFresh = await lockInventory(tx, sourceLocked.id);
        const destFresh = await lockInventory(tx, destination.id);
        if (!sourceFresh || !destFresh) {
          throw new LayerPriceError("LAYER_CHANGED", "No se pudieron bloquear los cubos de inventario.", 409);
        }
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "InventoryLayer" WHERE "inventoryId" = ${sourceFresh.id} ORDER BY "id" FOR UPDATE`
        );
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "InventoryLayer" WHERE "inventoryId" = ${destFresh.id} ORDER BY "id" FOR UPDATE`
        );
        const layerFresh = await tx.inventoryLayer.findUnique({ where: { id: layer.id } });
        if (
          !layerFresh ||
          layerFresh.unitPriceMxn != null ||
          !layerFresh.qty.equals(layer.qty) ||
          !layerFresh.reservedQty.equals(layer.reservedQty)
        ) {
          throw new LayerPriceError("LAYER_CHANGED", "La capa fue modificada por otra operación.", 409);
        }
        if (sourceFresh.qty.minus(sourceFresh.reservedQty).lessThan(qtyToValue)) {
          throw new LayerPriceError(
            "QTY_EXCEEDS_UNRESERVED",
            "La cantidad a valuar no puede superar el saldo no reservado."
          );
        }

        const sourceBefore = sourceFresh.qty;
        const destBefore = destFresh.qty;
        const totalBefore = sourceBefore.plus(destBefore);
        const qtyBefore = layerFresh.qty;

        const decremented = await decrementLayerAndParent(tx, sourceFresh.id, layerFresh.id, qtyToValue);
        const created = await tx.inventoryLayer.create({
          data: {
            inventoryId: destFresh.id,
            lotNumber: layerFresh.lotNumber,
            qty: qtyToValue,
            reservedQty: ZERO,
            receivedAt: layerFresh.receivedAt,
            unitPriceMxn: price,
            unitPriceUsd: layerFresh.unitPriceUsd,
            sourceReference: layerFresh.sourceReference,
            sourceType: layerFresh.sourceType
          }
        });
        const destAfter = await incrementParent(tx, destFresh.id, qtyToValue);
        const sourceAfter = await tx.inventory.findUniqueOrThrow({
          where: { id: sourceFresh.id },
          select: {
            id: true,
            qty: true,
            reservedQty: true,
            assignmentType: true,
            assignmentKey: true,
            projectId: true,
            productId: true,
            locationId: true,
            status: true
          }
        });
        const destCube = await tx.inventory.findUniqueOrThrow({
          where: { id: destFresh.id },
          select: {
            id: true,
            qty: true,
            reservedQty: true,
            assignmentType: true,
            assignmentKey: true,
            projectId: true,
            productId: true,
            locationId: true,
            status: true
          }
        });
        if (
          sourceAfter.productId !== destCube.productId ||
          sourceAfter.locationId !== destCube.locationId ||
          sourceAfter.status !== destCube.status ||
          sourceAfter.locationId !== loaded.inventory.locationId
        ) {
          throw new LayerPriceError(
            "ASSIGNMENT_LOCATION_MISMATCH",
            "La valuación con asignación no puede cambiar producto, ubicación ni estatus.",
            409
          );
        }
        const totalAfter = sourceAfter.qty.plus(destCube.qty);
        if (!totalBefore.equals(totalAfter) || !destAfter.qty.equals(destCube.qty)) {
          throw new LayerPriceError(
            "TRANSFER_TOTAL_MISMATCH",
            "La valuación con asignación no preservó el total físico.",
            409
          );
        }
        await assertLayerQtyTotal(tx, sourceAfter.id, sourceAfter.qty);
        await assertLayerQtyTotal(tx, destCube.id, destCube.qty);

        const movement = await tx.inventoryMovement.create({
          data: {
            productId: sourceFresh.productId,
            type: "ASSIGNMENT_TRANSFER",
            movementType: "ASSIGNMENT_TRANSFER",
            stockStatus: sourceFresh.status,
            qty: qtyToValue,
            warehouse: sourceFresh.location.warehouse,
            fromLocationId: sourceFresh.locationId,
            toLocationId: sourceFresh.locationId,
            inventoryLayerId: created.id,
            quantityBefore: sourceBefore,
            quantityAfter: sourceAfter.qty,
            userId: input.userId,
            ...outboundAssignmentFields(sourceAssignment),
            ...inboundAssignmentFields(destinationAssignment)
          }
        });

        await logActivity(
          {
            type: "INVENTORY",
            subtype: "LAYER_PRICE_SPLIT_ASSIGNMENT",
            reference: layer.inventory.product.sku,
            userId: input.userId,
            productId: layer.inventory.product.id,
            customerId: destinationAssignment.projectId || layer.inventory.projectId,
            clientId: sourceAssignment.clientId,
            warehouse: layer.inventory.location.warehouse,
            location: layer.inventory.location.code,
            qty: qtyToValue,
            result: "OK",
            metadata: {
              inventoryId: layer.inventoryId,
              sourceInventoryId: sourceAfter.id,
              destinationInventoryId: destCube.id,
              sourceLayerId: layer.id,
              valuedLayerId: created.id,
              qtyBefore: qtyBefore.toString(),
              qtyValued: qtyToValue.toString(),
              qtyRemaining: decremented.layer.qty.toString(),
              previousUnitPriceMxn: null,
              newUnitPriceMxn: price.toString(),
              sourceAssignmentType: sourceAssignment.assignmentType,
              destinationAssignmentType: destinationAssignment.assignmentType,
              sourceProjectId: sourceAssignment.projectId,
              destinationProjectId: destinationAssignment.projectId,
              fromAssignmentKey: sourceAssignment.assignmentKey,
              toAssignmentKey: destinationAssignment.assignmentKey,
              lotNumber: layerFresh.lotNumber,
              movementId: movement.id,
              userId: input.userId
            }
          },
          tx
        );

        const sourceLayers = await tx.inventoryLayer.findMany({
          where: { inventoryId: sourceAfter.id, qty: { gt: 0 } },
          select: {
            id: true,
            lotNumber: true,
            qty: true,
            reservedQty: true,
            unitPriceMxn: true,
            unitPriceUsd: true
          }
        });
        const destLayers = await tx.inventoryLayer.findMany({
          where: { inventoryId: destCube.id, qty: { gt: 0 } },
          select: {
            id: true,
            lotNumber: true,
            qty: true,
            reservedQty: true,
            unitPriceMxn: true,
            unitPriceUsd: true
          }
        });

        return {
          split: true,
          assignmentChanged: true,
          movementId: movement.id,
          movementType: "ASSIGNMENT_TRANSFER",
          sourceLayer: serializeLayer({
            ...layerFresh,
            qty: decremented.layer.qty,
            reservedQty: decremented.layer.reservedQty
          }),
          valuedLayer: serializeLayer(created),
          qtyAffected: qtyToValue.toString(),
          qtyBefore: qtyBefore.toString(),
          qtyRemaining: decremented.layer.qty.toString(),
          previousUnitPriceMxn: null,
          newUnitPriceMxn: price.toString(),
          valuation: calculateInventoryValuation(destLayers),
          sourceValuation: calculateInventoryValuation(sourceLayers),
          sourceAssignment: serializeAssignment(sourceAssignment),
          destinationAssignment: serializeAssignment(destinationAssignment),
          sourceInventoryId: sourceAfter.id,
          destinationInventoryId: destCube.id,
          source: {
            inventoryId: sourceAfter.id,
            qtyBefore: sourceBefore.toString(),
            qtyAfter: sourceAfter.qty.toString(),
            assignment: serializeAssignment(sourceAssignment)
          },
          destination: {
            inventoryId: destCube.id,
            qtyBefore: destBefore.toString(),
            qtyAfter: destCube.qty.toString(),
            assignment: serializeAssignment(destinationAssignment)
          },
          totalBefore: totalBefore.toString(),
          totalAfter: totalAfter.toString(),
          inventory: {
            id: destCube.id,
            assignmentType: destCube.assignmentType,
            projectId: destCube.projectId,
            sku: layer.inventory.product.sku,
            name: layer.inventory.product.name,
            location: layer.inventory.location.code,
            project: layer.inventory.project
              ? {
                  id: layer.inventory.project.id,
                  code: layer.inventory.project.code,
                  name: layer.inventory.project.name
                }
              : null
          }
        };
      },
      { maxWait: 5_000, timeout: 15_000 }
    );
  } catch (error) {
    asLayerPriceError(error);
  }
}
