import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { logClientActivity } from "../activity/activity-log.service.js";
import { HttpError } from "../../shared/http-error.js";

export const PHYSICAL_RESET_CONFIRMATION = "BORRAR INVENTARIO";
export const PHYSICAL_RESET_PATH = "/api/v1/inventory/physical/reset";

export type PhysicalResetDb = {
  $transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number }
  ): Promise<T>;
};

export type PhysicalResetResult = {
  ok: true;
  alreadyEmpty: boolean;
  inventoriesPurged: number;
  layersPurged: number;
  serialsPurged: number;
  reservationsPurged: number;
  legacyStockPurged: number;
  qtyCleared: string;
  reservedCleared: string;
  result: "PURGED";
  inventoriesZeroed: number;
  layersZeroed: number;
  serialsReleased: number;
  reservationsReleased: number;
  legacyStockZeroed: number;
  alreadyZero: false;
};

let physicalResetInFlight = false;

export function isPhysicalResetInFlight(): boolean {
  return physicalResetInFlight;
}

export function assertPhysicalResetConfirmation(value: unknown): void {
  const phrase = String(value ?? "").trim();
  if (phrase !== PHYSICAL_RESET_CONFIRMATION) {
    throw new HttpError(400, `Para confirmar escribe exactamente: ${PHYSICAL_RESET_CONFIRMATION}`);
  }
}

function decimalText(value: Prisma.Decimal | null | undefined): string {
  return value ? value.toString() : "0";
}

export async function applyPhysicalInventoryPurge(
  tx: Prisma.TransactionClient,
  actor: { userId: string; clientId: string }
): Promise<PhysicalResetResult> {
  const clientWhere = { clientId: actor.clientId };
  const [qtyAgg, reservedAgg, inventoryCount, layerCount, serialCount, reservationCount] = await Promise.all([
    tx.inventory.aggregate({ where: clientWhere, _sum: { qty: true } }),
    tx.inventory.aggregate({ where: clientWhere, _sum: { reservedQty: true } }),
    tx.inventory.count({ where: clientWhere }),
    tx.inventoryLayer.count({ where: { inventory: clientWhere } }),
    tx.inventorySerial.count({ where: clientWhere }),
    tx.inventoryReservation.count({ where: { inventory: clientWhere } })
  ]);

  const alreadyEmpty = inventoryCount === 0 && layerCount === 0 && serialCount === 0 && reservationCount === 0;

  const reservations = await tx.inventoryReservation.deleteMany({ where: { inventory: clientWhere } });
  const serials = await tx.inventorySerial.deleteMany({ where: clientWhere });
  const layers = await tx.inventoryLayer.deleteMany({ where: { inventory: clientWhere } });
  const inventories = await tx.inventory.deleteMany({ where: clientWhere });
  const stock = { count: 0 };

  const [afterInventory, afterLayers, afterSerials, afterReservations] = await Promise.all([
    tx.inventory.count({ where: clientWhere }),
    tx.inventoryLayer.count({ where: { inventory: clientWhere } }),
    tx.inventorySerial.count({ where: clientWhere }),
    tx.inventoryReservation.count({ where: { inventory: clientWhere } })
  ]);

  if (afterInventory !== 0 || afterLayers !== 0 || afterSerials !== 0 || afterReservations !== 0) {
    throw new HttpError(500, "El inventario operativo no quedó vacío. Se revirtió la operación.");
  }

  const result: PhysicalResetResult = {
    ok: true,
    alreadyEmpty,
    inventoriesPurged: inventories.count,
    layersPurged: layers.count,
    serialsPurged: serials.count,
    reservationsPurged: reservations.count,
    legacyStockPurged: stock.count,
    qtyCleared: decimalText(qtyAgg._sum.qty),
    reservedCleared: decimalText(reservedAgg._sum.reservedQty),
    result: "PURGED",
    inventoriesZeroed: inventories.count,
    layersZeroed: layers.count,
    serialsReleased: serials.count,
    reservationsReleased: reservations.count,
    legacyStockZeroed: stock.count,
    alreadyZero: false
  };

  await logClientActivity(
    {
      type: "INVENTORY",
      subtype: "PHYSICAL_RESET",
      reference: "physical-inventory-reset",
      userId: actor.userId,
      clientId: actor.clientId,
      qty: result.qtyCleared,
      result: result.result,
      metadata: {
        administratorUserId: actor.userId,
        inventoriesPurged: result.inventoriesPurged,
        layersPurged: result.layersPurged,
        serialsPurged: result.serialsPurged,
        reservationsPurged: result.reservationsPurged,
        legacyStockPurged: result.legacyStockPurged,
        qtyCleared: result.qtyCleared,
        reservedCleared: result.reservedCleared,
        alreadyEmpty: result.alreadyEmpty
      }
    },
    tx
  );

  return result;
}

/** @deprecated Use applyPhysicalInventoryPurge. Kept so existing callers keep compiling during the cutover. */
export async function applyPhysicalInventoryZero(
  tx: Prisma.TransactionClient,
  actor: { userId: string; clientId: string }
): Promise<PhysicalResetResult> {
  return applyPhysicalInventoryPurge(tx, actor);
}

export async function executePhysicalInventoryReset(
  actor: { userId: string; clientId: string },
  db: PhysicalResetDb = prisma
): Promise<PhysicalResetResult> {
  if (physicalResetInFlight) {
    throw new HttpError(409, "Ya hay un reinicio de inventario en curso.");
  }
  physicalResetInFlight = true;
  try {
    return await db.$transaction((tx) => applyPhysicalInventoryPurge(tx, actor), {
      maxWait: 15_000,
      timeout: 120_000
    });
  } finally {
    physicalResetInFlight = false;
  }
}
