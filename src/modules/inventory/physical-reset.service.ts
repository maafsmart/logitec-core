import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { logActivity } from "../activity/activity-log.service.js";
import { HttpError } from "../../shared/http-error.js";
import { isPhysicalResetInFlight, withPhysicalInventoryLock } from "./physical-inventory-lock.js";

export const PHYSICAL_RESET_CONFIRMATION = "BORRAR INVENTARIO";
export const PHYSICAL_RESET_PATH = "/api/v1/inventory/physical/reset";
export { isPhysicalResetInFlight };

export type PhysicalResetDb = {
  $transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number }
  ): Promise<T>;
};

export type PhysicalResetResult = {
  ok: true;
  alreadyZero: boolean;
  inventoriesZeroed: number;
  qtyCleared: string;
  reservedCleared: string;
  layersZeroed: number;
  serialsReleased: number;
  reservationsReleased: number;
  legacyStockZeroed: number;
  result: "ZEROED" | "ALREADY_ZERO";
};

export function assertPhysicalResetConfirmation(value: unknown): void {
  const phrase = String(value ?? "").trim();
  if (phrase !== PHYSICAL_RESET_CONFIRMATION) {
    throw new HttpError(400, `Para confirmar escribe exactamente: ${PHYSICAL_RESET_CONFIRMATION}`);
  }
}

function decimalText(value: Prisma.Decimal | null | undefined): string {
  return value ? value.toString() : "0";
}

function isPositive(value: Prisma.Decimal | null | undefined): boolean {
  return Boolean(value && value.gt(0));
}

export async function zeroPhysicalInventoryState(
  tx: Prisma.TransactionClient
): Promise<PhysicalResetResult> {
  const [qtyAgg, reservedAgg, layerQtyAgg, layerReservedAgg, stockAgg, serials, activeReservations, positiveCubes, positiveLayers, positiveStock] =
    await Promise.all([
      tx.inventory.aggregate({ _sum: { qty: true } }),
      tx.inventory.aggregate({ _sum: { reservedQty: true } }),
      tx.inventoryLayer.aggregate({ _sum: { qty: true } }),
      tx.inventoryLayer.aggregate({ _sum: { reservedQty: true } }),
      tx.inventoryStock.aggregate({ _sum: { quantity: true } }),
      tx.inventorySerial.count(),
      tx.inventoryReservation.count({ where: { status: "ACTIVE" } }),
      tx.inventory.count({ where: { OR: [{ qty: { gt: 0 } }, { reservedQty: { gt: 0 } }] } }),
      tx.inventoryLayer.count({ where: { OR: [{ qty: { gt: 0 } }, { reservedQty: { gt: 0 } }] } }),
      tx.inventoryStock.count({ where: { quantity: { gt: 0 } } })
    ]);

  const alreadyZero =
    !isPositive(qtyAgg._sum.qty) &&
    !isPositive(reservedAgg._sum.reservedQty) &&
    !isPositive(layerQtyAgg._sum.qty) &&
    !isPositive(layerReservedAgg._sum.reservedQty) &&
    !isPositive(stockAgg._sum.quantity) &&
    serials === 0 &&
    activeReservations === 0;

  if (!alreadyZero) {
    await tx.inventoryReservation.updateMany({
      where: { status: "ACTIVE" },
      data: { status: "RELEASED" }
    });
    await tx.inventory.updateMany({
      data: { qty: 0, reservedQty: 0 }
    });
    await tx.inventoryLayer.updateMany({
      data: { qty: 0, reservedQty: 0 }
    });
    await tx.inventoryStock.updateMany({
      data: { quantity: 0 }
    });
    // Occupancy only. Movements keep audit history via onDelete: SetNull.
    await tx.inventorySerial.deleteMany();
  }

  const [afterQty, afterReserved, afterLayerQty, afterLayerReserved, afterStock, afterSerials, afterActive] = await Promise.all([
    tx.inventory.aggregate({ _sum: { qty: true } }),
    tx.inventory.aggregate({ _sum: { reservedQty: true } }),
    tx.inventoryLayer.aggregate({ _sum: { qty: true } }),
    tx.inventoryLayer.aggregate({ _sum: { reservedQty: true } }),
    tx.inventoryStock.aggregate({ _sum: { quantity: true } }),
    tx.inventorySerial.count(),
    tx.inventoryReservation.count({ where: { status: "ACTIVE" } })
  ]);

  if (
    isPositive(afterQty._sum.qty) ||
    isPositive(afterReserved._sum.reservedQty) ||
    isPositive(afterLayerQty._sum.qty) ||
    isPositive(afterLayerReserved._sum.reservedQty) ||
    isPositive(afterStock._sum.quantity) ||
    afterSerials !== 0 ||
    afterActive !== 0
  ) {
    throw new HttpError(500, "El inventario no quedó en cero. Se revirtió la operación.");
  }

  return {
    ok: true,
    alreadyZero,
    inventoriesZeroed: alreadyZero ? 0 : positiveCubes,
    qtyCleared: alreadyZero ? "0" : decimalText(qtyAgg._sum.qty),
    reservedCleared: alreadyZero ? "0" : decimalText(reservedAgg._sum.reservedQty),
    layersZeroed: alreadyZero ? 0 : positiveLayers,
    serialsReleased: alreadyZero ? 0 : serials,
    reservationsReleased: alreadyZero ? 0 : activeReservations,
    legacyStockZeroed: alreadyZero ? 0 : positiveStock,
    result: alreadyZero ? "ALREADY_ZERO" : "ZEROED"
  };
}

export async function applyPhysicalInventoryZero(
  tx: Prisma.TransactionClient,
  actor: { userId: string }
): Promise<PhysicalResetResult> {
  const result = await zeroPhysicalInventoryState(tx);
  await logActivity(
    {
      type: "INVENTORY",
      subtype: "PHYSICAL_RESET",
      reference: "physical-inventory-reset",
      userId: actor.userId,
      qty: result.qtyCleared,
      result: result.result,
      metadata: {
        administratorUserId: actor.userId,
        inventoriesZeroed: result.inventoriesZeroed,
        qtyCleared: result.qtyCleared,
        reservedCleared: result.reservedCleared,
        layersZeroed: result.layersZeroed,
        serialsReleased: result.serialsReleased,
        reservationsReleased: result.reservationsReleased,
        legacyStockZeroed: result.legacyStockZeroed,
        alreadyZero: result.alreadyZero
      }
    },
    tx
  );
  return result;
}

export async function executePhysicalInventoryReset(
  actor: { userId: string },
  db: PhysicalResetDb = prisma
): Promise<PhysicalResetResult> {
  return withPhysicalInventoryLock("RESET", () =>
    db.$transaction((tx) => applyPhysicalInventoryZero(tx, actor), {
      maxWait: 15_000,
      timeout: 120_000
    })
  );
}
