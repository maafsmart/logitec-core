import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { logActivity } from "../activity/activity-log.service.js";
import { HttpError } from "../../shared/http-error.js";
import type { UserRole } from "../../middlewares/auth.middleware.js";
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

export { InventoryMutationError };

export function canTransferAssignment(role: UserRole): boolean {
  return role === "ADMIN" || role === "SUPERVISOR";
}

export function assertCanTransferAssignment(role: UserRole): void {
  if (!canTransferAssignment(role)) {
    throw new HttpError(403, "No autorizado para reasignar inventario.");
  }
}

export type AssignmentTransferInput = {
  sourceInventoryId: string;
  sourceLayerId?: string;
  qty: Prisma.Decimal;
  destinationAssignmentType: "PROJECT" | "FREE_TO_SALE";
  destinationProjectId?: string | null;
  userId: string;
  reference?: string | null;
  notes?: string | null;
  /** QA only: throw after destination inventory exists, before qty moves. */
  qaFailAfterDestination?: boolean;
};

function decEq(left: Prisma.Decimal | null, right: Prisma.Decimal | null) {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return left.equals(right);
}

function layersEquivalent(
  source: {
    lotNumber: string | null;
    unitPriceMxn: Prisma.Decimal | null;
    unitPriceUsd: Prisma.Decimal | null;
    sourceReference: string | null;
  },
  dest: {
    lotNumber: string | null;
    unitPriceMxn: Prisma.Decimal | null;
    unitPriceUsd: Prisma.Decimal | null;
    sourceReference: string | null;
  }
) {
  return (
    source.lotNumber === dest.lotNumber &&
    decEq(source.unitPriceMxn, dest.unitPriceMxn) &&
    decEq(source.unitPriceUsd, dest.unitPriceUsd) &&
    source.sourceReference === dest.sourceReference
  );
}

function serializeAssignment(assignment: InventoryAssignment) {
  return {
    assignmentType: assignment.assignmentType,
    projectId: assignment.projectId,
    assignmentKey: assignment.assignmentKey
  };
}

function activitySubtype(from: InventoryAssignment, to: InventoryAssignment) {
  if (from.assignmentType === "PROJECT" && to.assignmentType === "PROJECT") return "PROJECT_TO_PROJECT";
  if (from.assignmentType === "PROJECT" && to.assignmentType === "FREE_TO_SALE") return "PROJECT_TO_FREE_TO_SALE";
  if (from.assignmentType === "FREE_TO_SALE" && to.assignmentType === "PROJECT") return "FREE_TO_SALE_TO_PROJECT";
  return "ASSIGNMENT_TRANSFER";
}

async function incrementLayer(tx: Prisma.TransactionClient, layerId: string, delta: Prisma.Decimal) {
  const rows = await tx.$queryRaw<Array<{ id: string; qty: Prisma.Decimal }>>`
    UPDATE "InventoryLayer"
    SET qty = qty + ${delta}, "updatedAt" = NOW()
    WHERE id = ${layerId}
    RETURNING id, qty
  `;
  if (!rows.length) throw new InventoryMutationError("LAYER_NOT_AVAILABLE", "La capa destino no existe.");
  return rows[0]!;
}

async function selectTransferLayer(
  tx: Prisma.TransactionClient,
  inventoryId: string,
  qty: Prisma.Decimal,
  sourceLayerId?: string
) {
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "InventoryLayer" WHERE "inventoryId" = ${inventoryId} ORDER BY "id" FOR UPDATE`
  );
  const layers = await tx.inventoryLayer.findMany({
    where: { inventoryId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }]
  });
  const transferable = layers.filter((layer) => layer.qty.minus(layer.reservedQty).greaterThan(0));
  if (sourceLayerId) {
    const layer = layers.find((item) => item.id === sourceLayerId);
    if (!layer) throw new InventoryMutationError("LAYER_NOT_AVAILABLE", "La capa indicada no pertenece al inventario origen.");
    if (layer.qty.minus(layer.reservedQty).lessThan(qty)) {
      throw new InventoryMutationError(
        "INSUFFICIENT_LAYER_UNRESERVED",
        "La capa no tiene saldo no reservado suficiente para reasignar."
      );
    }
    return layer;
  }
  if (!transferable.length) {
    throw new InventoryMutationError(
      "INSUFFICIENT_UNRESERVED_FOR_TRANSFER",
      "No hay saldo no reservado para reasignar."
    );
  }
  if (transferable.length > 1) {
    throw new InventoryMutationError(
      "LAYER_SELECTION_REQUIRED",
      "Hay varias capas con saldo transferible; indica sourceLayerId.",
      {
        layers: transferable.map((layer) => ({
          layerId: layer.id,
          lotNumber: layer.lotNumber,
          qty: layer.qty.toString(),
          reservedQty: layer.reservedQty.toString(),
          freeQty: layer.qty.minus(layer.reservedQty).toString()
        }))
      }
    );
  }
  const only = transferable[0]!;
  if (only.qty.minus(only.reservedQty).lessThan(qty)) {
    throw new InventoryMutationError(
      "INSUFFICIENT_LAYER_UNRESERVED",
      "La capa no tiene saldo no reservado suficiente para reasignar."
    );
  }
  return only;
}

export async function transferAssignment(input: AssignmentTransferInput) {
  if (input.qty.lessThanOrEqualTo(0)) {
    throw new InventoryMutationError("INVALID_QTY", "La cantidad a reasignar debe ser mayor a 0.");
  }
  const destinationAssignment = buildAssignment(
    input.destinationAssignmentType,
    input.destinationAssignmentType === "FREE_TO_SALE" ? null : input.destinationProjectId ?? null
  );

  return prisma.$transaction(
    async (tx) => {
      const source = await lockInventory(tx, input.sourceInventoryId);
      if (!source) throw new InventoryMutationError("INVENTORY_NOT_FOUND", "Línea de inventario origen no encontrada.");
      if (source.qty.lessThanOrEqualTo(0)) {
        throw new InventoryMutationError("INSUFFICIENT_UNRESERVED_FOR_TRANSFER", "El origen no tiene existencia para reasignar.");
      }
      const sourceFree = source.qty.minus(source.reservedQty);
      if (input.qty.greaterThan(sourceFree)) {
        throw new InventoryMutationError(
          "INSUFFICIENT_UNRESERVED_FOR_TRANSFER",
          "No se puede reasignar cantidad reservada o mayor al saldo libre."
        );
      }

      const sourceAssignment = assignmentFromInventory(source);
      if (
        sourceAssignment.assignmentType === destinationAssignment.assignmentType &&
        sourceAssignment.projectId === destinationAssignment.projectId &&
        sourceAssignment.assignmentKey === destinationAssignment.assignmentKey
      ) {
        throw new InventoryMutationError("SAME_ASSIGNMENT", "Origen y destino tienen la misma asignación.");
      }

      const sourceLayer = await selectTransferLayer(tx, source.id, input.qty, input.sourceLayerId);
      await assertNoSerialAmbiguity(tx, sourceLayer.id);

      if (destinationAssignment.assignmentType === "PROJECT") {
        const project = await tx.customer.findUnique({
          where: { id: destinationAssignment.projectId! },
          select: { id: true }
        });
        if (!project) throw new InventoryMutationError("PROJECT_NOT_FOUND", "Proyecto destino no encontrado.");
        await ensureCanonicalProductProject(tx, source.productId, destinationAssignment.projectId);
      }

      const destination = await ensureInventory(
        tx,
        source.productId,
        source.locationId,
        source.status,
        destinationAssignment
      );
      if (destination.productId !== source.productId || destination.locationId !== source.locationId || destination.status !== source.status) {
        throw new InventoryMutationError(
          "ASSIGNMENT_LOCATION_MISMATCH",
          "La reasignación no puede cambiar producto, ubicación ni estatus."
        );
      }
      if (destination.id === source.id) {
        throw new InventoryMutationError("SAME_ASSIGNMENT", "Origen y destino tienen la misma asignación.");
      }

      if (input.qaFailAfterDestination) {
        throw new InventoryMutationError("QA_FORCED_FAILURE", "Fallo controlado de QA después de asegurar destino.");
      }

      await lockInventories(tx, [source.id, destination.id]);
      const sourceFresh = await lockInventory(tx, source.id);
      const destFresh = await lockInventory(tx, destination.id);
      if (!sourceFresh || !destFresh) {
        throw new InventoryMutationError("INVENTORY_NOT_FOUND", "No se pudieron bloquear las líneas de reasignación.");
      }
      const destBefore = destFresh.qty;
      const sourceBefore = sourceFresh.qty;
      if (sourceFresh.qty.minus(sourceFresh.reservedQty).lessThan(input.qty)) {
        throw new InventoryMutationError(
          "INSUFFICIENT_UNRESERVED_FOR_TRANSFER",
          "No se puede reasignar cantidad reservada o mayor al saldo libre."
        );
      }

      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "InventoryLayer" WHERE "inventoryId" = ${destFresh.id} ORDER BY "id" FOR UPDATE`
      );
      const destLayers = await tx.inventoryLayer.findMany({
        where: { inventoryId: destFresh.id },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      });
      const equivalent = destLayers.filter((layer) => layersEquivalent(sourceLayer, layer));
      let destLayerId: string;
      if (equivalent.length === 1) {
        destLayerId = equivalent[0]!.id;
        await incrementLayer(tx, destLayerId, input.qty);
      } else {
        const created = await tx.inventoryLayer.create({
          data: {
            inventoryId: destFresh.id,
            lotNumber: sourceLayer.lotNumber,
            qty: input.qty,
            reservedQty: 0,
            receivedAt: sourceLayer.receivedAt,
            unitPriceMxn: sourceLayer.unitPriceMxn,
            unitPriceUsd: sourceLayer.unitPriceUsd,
            sourceReference: sourceLayer.sourceReference,
            sourceType: sourceLayer.sourceType
          }
        });
        destLayerId = created.id;
      }

      try {
        await decrementLayerAndParent(tx, sourceFresh.id, sourceLayer.id, input.qty);
      } catch (error) {
        if (error instanceof InventoryMutationError && error.code === "INSUFFICIENT_STOCK") {
          throw new InventoryMutationError(
            "INSUFFICIENT_UNRESERVED_FOR_TRANSFER",
            "No se puede reasignar cantidad reservada o mayor al saldo libre."
          );
        }
        throw error;
      }
      const destAfter = await incrementParent(tx, destFresh.id, input.qty);
      const sourceAfter = await tx.inventory.findUniqueOrThrow({ where: { id: sourceFresh.id } });
      const totalBefore = sourceBefore.plus(destBefore);
      const totalAfter = sourceAfter.qty.plus(destAfter.qty);
      if (!totalBefore.equals(totalAfter)) {
        throw new InventoryMutationError("TRANSFER_TOTAL_MISMATCH", "La reasignación no preservó el total físico.");
      }

      const movement = await tx.inventoryMovement.create({
        data: {
          productId: source.productId,
          type: "ASSIGNMENT_TRANSFER",
          movementType: "ASSIGNMENT_TRANSFER",
          stockStatus: source.status,
          qty: input.qty,
          warehouse: source.location.warehouse,
          fromLocationId: source.locationId,
          toLocationId: source.locationId,
          inventoryLayerId: destLayerId,
          quantityBefore: sourceBefore,
          quantityAfter: sourceAfter.qty,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          userId: input.userId,
          ...outboundAssignmentFields(sourceAssignment),
          ...inboundAssignmentFields(destinationAssignment)
        }
      });

      await logActivity(
        {
          type: "INVENTORY_ASSIGNMENT_TRANSFER",
          subtype: activitySubtype(sourceAssignment, destinationAssignment),
          reference: input.reference ?? source.product.sku,
          userId: input.userId,
          productId: source.productId,
          customerId: destinationAssignment.projectId ?? sourceAssignment.projectId ?? source.product.customerId,
          warehouse: source.location.warehouse,
          location: source.location.code,
          qty: input.qty,
          result: "OK",
          metadata: {
            sku: source.product.sku,
            qty: input.qty.toString(),
            sourceInventoryId: source.id,
            destinationInventoryId: destFresh.id,
            sourceLayerId: sourceLayer.id,
            destinationLayerId: destLayerId,
            fromAssignmentKey: sourceAssignment.assignmentKey,
            toAssignmentKey: destinationAssignment.assignmentKey,
            location: source.location.code,
            status: source.status,
            reference: input.reference ?? null,
            movementId: movement.id
          }
        },
        tx
      );

      return {
        source: {
          inventoryId: source.id,
          assignment: serializeAssignment(sourceAssignment),
          qtyBefore: sourceBefore.toString(),
          qtyAfter: sourceAfter.qty.toString()
        },
        destination: {
          inventoryId: destFresh.id,
          assignment: serializeAssignment(destinationAssignment),
          qtyBefore: destBefore.toString(),
          qtyAfter: destAfter.qty.toString()
        },
        transferredQty: input.qty.toString(),
        movementId: movement.id,
        totalBefore: totalBefore.toString(),
        totalAfter: totalAfter.toString(),
        movement
      };
    },
    { maxWait: 5_000, timeout: 15_000 }
  );
}
