import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { logClientActivity } from "../activity/activity-log.service.js";
import { HttpError } from "../../shared/http-error.js";
import { isCompanyProjectLabel } from "./inventory-project-rules.js";

export const PHYSICAL_RESET_CONFIRMATION = "BORRAR INVENTARIO DE AVIAT";
export const PHYSICAL_RESET_PATH = "/api/v1/inventory/physical/reset";
export const TENANT_INVENTORY_RESET_FLAG = "ALLOW_TENANT_INVENTORY_RESET";
/** Distinct from Prisma migrate's advisory lock key 72707369. */
export const PHYSICAL_RESET_ADVISORY_LOCK_CLASS = 90429101;

export type PhysicalResetDb = {
  $transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number }
  ): Promise<T>;
};

export type PhysicalResetCounts = {
  inventories: number;
  layers: number;
  serials: number;
  reservations: number;
  movements: number;
  scanEvents: number;
  activityLogs: number;
  requisitions: number;
  tasks: number;
  productProjects: number;
  importBatches: number;
  legacyStock: number;
  qty: string;
  reservedQty: string;
};

export type PhysicalResetResult = {
  ok: true;
  alreadyEmpty: boolean;
  inventoriesPurged: number;
  layersPurged: number;
  serialsPurged: number;
  reservationsPurged: number;
  movementsPurged: number;
  scanEventsPurged: number;
  activityLogsPurged: number;
  requisitionsPurged: number;
  tasksPurged: number;
  productProjectsPurged: number;
  importBatchesPurged: number;
  legacyStockPurged: number;
  qtyCleared: string;
  reservedCleared: string;
  orphanProductsRetained: number;
  legacyLogitec:
    | {
        found: false;
      }
    | {
        found: true;
        id: string;
        clientId: string | null;
        code: string;
        name: string;
        deleted: boolean;
        retained: boolean;
        remainingDependencies: number;
      };
  result: "PURGED";
  inventoriesZeroed: number;
  layersZeroed: number;
  serialsReleased: number;
  reservationsReleased: number;
  legacyStockZeroed: number;
  alreadyZero: false;
};

export type PhysicalResetPreview = {
  flagEnabled: boolean;
  isAviat: boolean;
  canExecute: boolean;
  clientId: string;
  counts: PhysicalResetCounts;
};

let physicalResetInFlight = false;

export function isPhysicalResetInFlight(): boolean {
  return physicalResetInFlight;
}

export function isTenantInventoryResetAllowed(): boolean {
  return String(process.env[TENANT_INVENTORY_RESET_FLAG] ?? "").trim().toLowerCase() === "true";
}

export function assertTenantInventoryResetAllowed(): void {
  if (!isTenantInventoryResetAllowed()) {
    throw new HttpError(
      403,
      "El reinicio de inventario de AVIAT está desactivado. Actívalo solo para el ensayo y la carga inicial.",
      "TENANT_INVENTORY_RESET_DISABLED"
    );
  }
}

export function assertPhysicalResetConfirmation(value: unknown): void {
  const phrase = String(value ?? "").trim();
  if (phrase !== PHYSICAL_RESET_CONFIRMATION) {
    throw new HttpError(400, `Para confirmar escribe exactamente: ${PHYSICAL_RESET_CONFIRMATION}`, "PHYSICAL_RESET_CONFIRMATION_INVALID");
  }
}

export function assertPhysicalResetFinalConfirmation(confirmation: unknown, finalConfirmation: unknown): void {
  assertPhysicalResetConfirmation(confirmation);
  assertPhysicalResetConfirmation(finalConfirmation);
}

function decimalText(value: Prisma.Decimal | null | undefined): string {
  return value ? value.toString() : "0";
}

function isExactAviatLabel(value: unknown): boolean {
  return String(value ?? "").trim().toUpperCase() === "AVIAT";
}

export async function resolveUniqueAviatClientId(tx: Prisma.TransactionClient): Promise<string> {
  const clients = await tx.client.findMany({
    select: { id: true, code: true, name: true, tradeName: true, legalName: true }
  });
  const ids = [
    ...new Set(
      clients
        .filter(
          (row) =>
            isExactAviatLabel(row.code) ||
            isExactAviatLabel(row.name) ||
            isExactAviatLabel(row.tradeName) ||
            isExactAviatLabel(row.legalName)
        )
        .map((row) => row.id)
    )
  ];
  if (ids.length !== 1) {
    throw new HttpError(
      409,
      `Se requiere exactamente un cliente AVIAT inequívoco (encontrados ${ids.length}).`,
      "AVIAT_CLIENT_NOT_UNIQUE"
    );
  }
  return ids[0]!;
}

export function assertAviatOperationalClient(operationalClientId: string, aviatId: string): void {
  if (operationalClientId !== aviatId) {
    throw new HttpError(
      403,
      "El reinicio operativo solo está permitido para el cliente AVIAT activo.",
      "TENANT_INVENTORY_RESET_NOT_AVIAT"
    );
  }
}

export async function tryAcquirePhysicalResetLock(
  tx: { $queryRaw: Prisma.TransactionClient["$queryRaw"] },
  clientId: string
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_xact_lock(CAST(${PHYSICAL_RESET_ADVISORY_LOCK_CLASS} AS INTEGER), hashtext(${clientId})) AS locked
  `;
  return Boolean(rows[0]?.locked);
}

async function collectOperationalCounts(
  tx: Prisma.TransactionClient,
  clientId: string
): Promise<PhysicalResetCounts> {
  const clientWhere = { clientId };
  const projectWhere = { project: { clientId } };
  const [
    qtyAgg,
    reservedAgg,
    inventories,
    layers,
    serials,
    reservations,
    movements,
    scanEvents,
    activityLogs,
    requisitions,
    tasks,
    productProjects,
    importBatches
  ] = await Promise.all([
    tx.inventory.aggregate({ where: clientWhere, _sum: { qty: true } }),
    tx.inventory.aggregate({ where: clientWhere, _sum: { reservedQty: true } }),
    tx.inventory.count({ where: clientWhere }),
    tx.inventoryLayer.count({ where: { inventory: clientWhere } }),
    tx.inventorySerial.count({ where: clientWhere }),
    tx.inventoryReservation.count({
      where: {
        OR: [{ inventory: clientWhere }, { requisitionLine: { requisition: projectWhere } }]
      }
    }),
    tx.inventoryMovement.count({ where: clientWhere }),
    tx.scanEvent.count({ where: clientWhere }),
    tx.activityLog.count({ where: clientWhere }),
    tx.requisition.count({ where: projectWhere }),
    tx.task.count({ where: clientWhere }),
    tx.productProject.count({ where: { project: { clientId } } }),
    tx.importBatch.count({ where: clientWhere })
  ]);

  return {
    inventories,
    layers,
    serials,
    reservations,
    movements,
    scanEvents,
    activityLogs,
    requisitions,
    tasks,
    productProjects,
    importBatches,
    legacyStock: 0,
    qty: decimalText(qtyAgg._sum.qty),
    reservedQty: decimalText(reservedAgg._sum.reservedQty)
  };
}

async function countOrphanProducts(tx: Prisma.TransactionClient): Promise<number> {
  return tx.product.count({
    where: {
      inventories: { none: {} },
      inventorySerials: { none: {} },
      inventoryMovements: { none: {} },
      productProjects: { none: {} },
      requisitionLines: { none: {} },
      scanEvents: { none: {} }
    }
  });
}

async function inspectLegacyLogitec(
  tx: Prisma.TransactionClient,
  clientId: string
): Promise<PhysicalResetResult["legacyLogitec"]> {
  const projects = await tx.customer.findMany({
    where: { clientId },
    select: { id: true, clientId: true, code: true, name: true }
  });
  const matches = projects.filter(
    (row) => isCompanyProjectLabel(row.code) || isCompanyProjectLabel(row.name)
  );
  if (matches.length === 0) return { found: false };
  if (matches.length !== 1) {
    return {
      found: true,
      id: matches.map((row) => row.id).join(","),
      clientId,
      code: "LOGITEC",
      name: "LOGITEC",
      deleted: false,
      retained: true,
      remainingDependencies: -1
    };
  }
  const project = matches[0]!;
  const remainingDependencies =
    (await tx.inventory.count({ where: { projectId: project.id } })) +
    (await tx.requisition.count({ where: { projectId: project.id } })) +
    (await tx.productProject.count({ where: { projectId: project.id } })) +
    (await tx.inventoryMovement.count({
      where: { OR: [{ fromProjectId: project.id }, { toProjectId: project.id }] }
    })) +
    (await tx.product.count({ where: { customerId: project.id } })) +
    (await tx.activityLog.count({ where: { customerId: project.id } }));
  if (remainingDependencies > 0) {
    return {
      found: true,
      id: project.id,
      clientId: project.clientId,
      code: project.code,
      name: project.name,
      deleted: false,
      retained: true,
      remainingDependencies
    };
  }
  await tx.customer.delete({ where: { id: project.id } });
  return {
    found: true,
    id: project.id,
    clientId: project.clientId,
    code: project.code,
    name: project.name,
    deleted: true,
    retained: false,
    remainingDependencies: 0
  };
}

export async function previewPhysicalInventoryReset(
  actor: { userId: string; clientId: string },
  db: PhysicalResetDb = prisma
): Promise<PhysicalResetPreview> {
  return db.$transaction(async (tx) => {
    const aviatId = await resolveUniqueAviatClientId(tx);
    const isAviat = actor.clientId === aviatId;
    const counts = isAviat
      ? await collectOperationalCounts(tx, aviatId)
      : {
          inventories: 0,
          layers: 0,
          serials: 0,
          reservations: 0,
          movements: 0,
          scanEvents: 0,
          activityLogs: 0,
          requisitions: 0,
          tasks: 0,
          productProjects: 0,
          importBatches: 0,
          legacyStock: 0,
          qty: "0",
          reservedQty: "0"
        };
    const flagEnabled = isTenantInventoryResetAllowed();
    return {
      flagEnabled,
      isAviat,
      canExecute: flagEnabled && isAviat,
      clientId: actor.clientId,
      counts
    };
  });
}

export async function applyPhysicalInventoryPurge(
  tx: Prisma.TransactionClient,
  actor: { userId: string; clientId: string }
): Promise<PhysicalResetResult> {
  const aviatId = await resolveUniqueAviatClientId(tx);
  assertAviatOperationalClient(actor.clientId, aviatId);
  const clientWhere = { clientId: aviatId };
  const projectWhere = { project: { clientId: aviatId } };
  const before = await collectOperationalCounts(tx, aviatId);
  const alreadyEmpty =
    before.inventories === 0 &&
    before.layers === 0 &&
    before.serials === 0 &&
    before.reservations === 0 &&
    before.movements === 0 &&
    before.scanEvents === 0 &&
    before.requisitions === 0 &&
    before.tasks === 0 &&
    before.productProjects === 0 &&
    before.importBatches === 0;

  const aviatTaskIds = await tx.task.findMany({
    where: clientWhere,
    select: { id: true }
  });
  const taskIdList = aviatTaskIds.map((row) => row.id);

  const reservations = await tx.inventoryReservation.deleteMany({
    where: {
      OR: [{ inventory: clientWhere }, { requisitionLine: { requisition: projectWhere } }]
    }
  });

  await tx.inventoryMovement.updateMany({
    where: clientWhere,
    data: {
      inventorySerialId: null,
      inventoryLayerId: null,
      requisitionLineId: null,
      taskId: null
    }
  });
  const movements = await tx.inventoryMovement.deleteMany({ where: clientWhere });

  const scanEvents = await tx.scanEvent.deleteMany({ where: clientWhere });
  const activityLogs = await tx.activityLog.deleteMany({ where: clientWhere });

  const serials = await tx.inventorySerial.deleteMany({ where: clientWhere });
  const layers = await tx.inventoryLayer.deleteMany({ where: { inventory: clientWhere } });
  const inventories = await tx.inventory.deleteMany({ where: clientWhere });

  if (taskIdList.length) {
    await tx.task.updateMany({
      where: { id: { in: taskIdList } },
      data: { requisitionId: null }
    });
  }
  const tasks = taskIdList.length
    ? await tx.task.deleteMany({ where: { id: { in: taskIdList } } })
    : { count: 0 };

  const requisitions = await tx.requisition.deleteMany({ where: projectWhere });
  const productProjects = await tx.productProject.deleteMany({ where: { project: { clientId: aviatId } } });

  await tx.product.updateMany({
    where: { customer: { clientId: aviatId } },
    data: { customerId: null }
  });

  const importBatches = await tx.importBatch.deleteMany({
    where: { clientId: aviatId }
  });

  const after = await collectOperationalCounts(tx, aviatId);
  if (
    after.inventories !== 0 ||
    after.layers !== 0 ||
    after.serials !== 0 ||
    after.reservations !== 0 ||
    after.movements !== 0 ||
    after.scanEvents !== 0 ||
    after.requisitions !== 0 ||
    after.tasks !== 0
  ) {
    throw new HttpError(500, "El inventario operativo de AVIAT no quedó vacío. Se revirtió la operación.");
  }

  const legacyLogitec = await inspectLegacyLogitec(tx, aviatId);
  const orphanProductsRetained = await countOrphanProducts(tx);

  const result: PhysicalResetResult = {
    ok: true,
    alreadyEmpty,
    inventoriesPurged: inventories.count,
    layersPurged: layers.count,
    serialsPurged: serials.count,
    reservationsPurged: reservations.count,
    movementsPurged: movements.count,
    scanEventsPurged: scanEvents.count,
    activityLogsPurged: activityLogs.count,
    requisitionsPurged: requisitions.count,
    tasksPurged: tasks.count,
    productProjectsPurged: productProjects.count,
    importBatchesPurged: importBatches.count,
    legacyStockPurged: 0,
    qtyCleared: before.qty,
    reservedCleared: before.reservedQty,
    orphanProductsRetained,
    legacyLogitec,
    result: "PURGED",
    inventoriesZeroed: inventories.count,
    layersZeroed: layers.count,
    serialsReleased: serials.count,
    reservationsReleased: reservations.count,
    legacyStockZeroed: 0,
    alreadyZero: false
  };

  await logClientActivity(
    {
      type: "INVENTORY",
      subtype: "PHYSICAL_RESET",
      reference: "physical-inventory-reset",
      userId: actor.userId,
      clientId: aviatId,
      qty: result.qtyCleared,
      result: result.result,
      metadata: {
        administratorUserId: actor.userId,
        inventoriesPurged: result.inventoriesPurged,
        layersPurged: result.layersPurged,
        serialsPurged: result.serialsPurged,
        reservationsPurged: result.reservationsPurged,
        movementsPurged: result.movementsPurged,
        scanEventsPurged: result.scanEventsPurged,
        activityLogsPurged: result.activityLogsPurged,
        requisitionsPurged: result.requisitionsPurged,
        tasksPurged: result.tasksPurged,
        productProjectsPurged: result.productProjectsPurged,
        importBatchesPurged: result.importBatchesPurged,
        legacyStockPurged: result.legacyStockPurged,
        qtyCleared: result.qtyCleared,
        reservedCleared: result.reservedCleared,
        alreadyEmpty: result.alreadyEmpty,
        orphanProductsRetained: result.orphanProductsRetained,
        legacyLogitec: result.legacyLogitec
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
  assertTenantInventoryResetAllowed();
  if (physicalResetInFlight) {
    throw new HttpError(409, "Ya hay un reinicio de inventario en curso.", "PHYSICAL_RESET_IN_FLIGHT");
  }
  physicalResetInFlight = true;
  try {
    return await db.$transaction(async (tx) => {
      const locked = await tryAcquirePhysicalResetLock(tx, actor.clientId);
      if (!locked) {
        throw new HttpError(409, "Ya hay un reinicio de inventario en curso.", "PHYSICAL_RESET_IN_FLIGHT");
      }
      return applyPhysicalInventoryPurge(tx, actor);
    }, {
      maxWait: 15_000,
      timeout: 300_000
    });
  } finally {
    physicalResetInFlight = false;
  }
}
