import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../shared/http-error.js";
import {
  assertAviatOperationalClient,
  resolveUniqueAviatClientId
} from "../inventory/physical-reset.service.js";

export const OPERATIONAL_HISTORY_CONFIRMATION = "LIMPIAR HISTORIAL OPERATIVO DE AVIAT";
export const OPERATIONAL_HISTORY_POLICY = "CLEAN_START_AVIAT";
/** Distinct from Prisma migrate (72707369) and physical reset (90429101). */
export const OPERATIONAL_HISTORY_ADVISORY_LOCK_CLASS = 90429102;
/** @deprecated Use OPERATIONAL_HISTORY_POLICY. Kept so older tests/imports keep compiling. */
export const OPERATIONAL_HISTORY_DECISION = OPERATIONAL_HISTORY_POLICY;

export const HISTORY_CATEGORIES = [
  "movements",
  "scanEvents",
  "activityLogs",
  "tasks",
  "requisitions",
  "importBatches",
  "incidents",
  "comments"
] as const;

export type HistoryCategory = (typeof HISTORY_CATEGORIES)[number];

export type HistoryDb = {
  $transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number }
  ): Promise<T>;
};

export type IncidentPreviewRow = {
  id: string;
  type: string;
  status: string;
  createdAt: Date | string;
  warehouse: string | null;
  notesPreview: string;
};

export type HistoryCategoryCount = {
  total: number;
  selectable: true;
};

export type OperationalHistoryPreview = {
  separateFromInventoryReset: true;
  executesAutomatically: false;
  clientId: string;
  isAviat: boolean;
  policy: typeof OPERATIONAL_HISTORY_POLICY;
  decision: typeof OPERATIONAL_HISTORY_POLICY;
  decisionReason: string;
  canReachZeroOperationalHistory: boolean;
  inventoryResetDoesNotDelete: string[];
  historyCleanupDeletes: HistoryCategory[];
  mastersPreserved: string[];
  doesNotTouchGitHub: true;
  doesNotRewriteGitHistory: true;
  repositoryHistoryPreserved: string[];
  counts: {
    movements: HistoryCategoryCount;
    scanEvents: HistoryCategoryCount;
    activityLogs: HistoryCategoryCount;
    tasks: HistoryCategoryCount;
    requisitions: HistoryCategoryCount;
    importBatches: HistoryCategoryCount;
    incidents: HistoryCategoryCount & {
      byType: Record<string, number>;
      byStatus: Record<string, number>;
      records: IncidentPreviewRow[];
    };
    comments: HistoryCategoryCount;
    reservationsToRelease: number;
  };
  leftoverOutsideInventoryReset: {
    incidents: {
      total: number;
      byType: Record<string, number>;
      byStatus: Record<string, number>;
      records: IncidentPreviewRow[];
    };
    comments: { total: number };
  };
  coveredByInventoryReset: {
    inventories: number;
    movements: number;
    scanEvents: number;
    activityLogs: number;
    tasks: number;
    requisitions: number;
    importBatches: number;
  };
  integrity: {
    cannotPurgeWithoutTouchingMasters: Array<{ category: string; reason: string }>;
    reservationsToRelease: number;
    reservationsNote: string;
    globalActivityLogsRetained: number;
  };
  mastersRetained: {
    users: number;
    products: number;
    warehouses: number;
    locations: number;
    projects: number;
    clients: number;
  };
};

export type OperationalHistoryCleanupResult = {
  ok: true;
  executed: true;
  clientId: string;
  deleted: Record<HistoryCategory, number> & { reservationsReleased: number };
  leftover: Record<HistoryCategory, number>;
  reachedZeroOperationalHistory: boolean;
  untouchedOtherClient: true;
  mastersUntouched: true;
  doesNotTouchGitHub: true;
  repositoryUntouched: true;
};

const MASTERS_PRESERVED = [
  "cliente AVIAT",
  "usuarios/cuentas",
  "roles",
  "proyectos",
  "catálogo/productos",
  "almacenes",
  "ubicaciones",
  "existencias/inventario físico"
];

/** CLEAN_START never touches GitHub / Git technical history. */
export const REPOSITORY_HISTORY_PRESERVED = [
  "commits históricos",
  "historial Git (sin reescritura ni force push)",
  "ramas con valor de auditoría",
  "PRs, comentarios y evidencia técnica",
  "versiones anteriores del código"
];

const REPOSITORY_GUARD = {
  doesNotTouchGitHub: true as const,
  doesNotRewriteGitHistory: true as const,
  repositoryHistoryPreserved: [...REPOSITORY_HISTORY_PRESERVED]
};

function notesPreview(notes: string | null | undefined): string {
  const text = String(notes || "").replace(/\s+/g, " ").trim();
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] || 0) + 1;
}

function emptyIncidents(): OperationalHistoryPreview["counts"]["incidents"] {
  return { total: 0, selectable: true, byType: {}, byStatus: {}, records: [] };
}

export function assertOperationalHistoryConfirmation(value: unknown): void {
  if (String(value ?? "").trim() !== OPERATIONAL_HISTORY_CONFIRMATION) {
    throw new HttpError(
      400,
      `Para confirmar escribe exactamente: ${OPERATIONAL_HISTORY_CONFIRMATION}`,
      "OPERATIONAL_HISTORY_CONFIRMATION_INVALID"
    );
  }
}

export function assertHistoryCategorySelection(input: {
  categories?: unknown;
  incidentIds?: unknown;
  incidentTypes?: unknown;
}): { categories: HistoryCategory[]; incidentIds: string[]; incidentTypes: string[] } {
  const raw = Array.isArray(input.categories) ? input.categories.map((item) => String(item)) : [];
  const expanded = raw.includes("all") ? [...HISTORY_CATEGORIES] : raw;
  const categories = [...new Set(expanded.filter((item): item is HistoryCategory =>
    (HISTORY_CATEGORIES as readonly string[]).includes(item)
  ))];
  if (!categories.length) {
    throw new HttpError(
      400,
      "Selecciona al menos una categoría de historial operativo. El preview no ejecuta nada.",
      "HISTORY_CATEGORY_REQUIRED"
    );
  }
  const incidentIds = Array.isArray(input.incidentIds)
    ? [...new Set(input.incidentIds.map((item) => String(item).trim()).filter(Boolean))]
    : [];
  const incidentTypes = Array.isArray(input.incidentTypes)
    ? [...new Set(input.incidentTypes.map((item) => String(item).trim().toUpperCase()).filter(Boolean))]
    : [];
  return { categories, incidentIds, incidentTypes };
}

async function countCoveredByInventoryReset(tx: Prisma.TransactionClient, clientId: string) {
  const projectWhere = { project: { clientId } };
  const [inventories, movements, scanEvents, activityLogs, tasks, requisitions, importBatches] = await Promise.all([
    tx.inventory.count({ where: { clientId } }),
    tx.inventoryMovement.count({ where: { clientId } }),
    tx.scanEvent.count({ where: { clientId } }),
    tx.activityLog.count({ where: { clientId } }),
    tx.task.count({ where: { clientId } }),
    tx.requisition.count({ where: projectWhere }),
    tx.importBatch.count({ where: { clientId } })
  ]);
  return { inventories, movements, scanEvents, activityLogs, tasks, requisitions, importBatches };
}

async function countMasters(tx: Prisma.TransactionClient) {
  const [users, products, warehouses, locations, projects, clients] = await Promise.all([
    tx.user.count(),
    tx.product.count(),
    tx.warehouse.count(),
    tx.location.count(),
    tx.customer.count(),
    tx.client.count()
  ]);
  return { users, products, warehouses, locations, projects, clients };
}

const AVIAT_REQUISITION_RESERVATION_WHERE = (clientId: string): Prisma.InventoryReservationWhereInput => ({
  requisitionLine: { requisition: { project: { clientId } } }
});

async function countReservationsToRelease(tx: Prisma.TransactionClient, clientId: string): Promise<number> {
  return tx.inventoryReservation.count({
    where: AVIAT_REQUISITION_RESERVATION_WHERE(clientId)
  });
}

async function collectIncidentPreview(tx: Prisma.TransactionClient, clientId: string) {
  const incidents = await tx.incident.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, status: true, createdAt: true, warehouse: true, notes: true }
  });
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const records = incidents.map((row) => {
    increment(byType, row.type);
    increment(byStatus, row.status);
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      createdAt: row.createdAt,
      warehouse: row.warehouse,
      notesPreview: notesPreview(row.notes)
    };
  });
  return { total: incidents.length, selectable: true as const, byType, byStatus, records };
}

function toDecimal(value: unknown): Prisma.Decimal {
  return value instanceof Prisma.Decimal ? value : new Prisma.Decimal(String(value ?? 0));
}

export async function tryAcquireOperationalHistoryLock(
  tx: { $queryRaw: Prisma.TransactionClient["$queryRaw"] },
  clientId: string
): Promise<boolean> {
  const rows = await tx.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_xact_lock(CAST(${OPERATIONAL_HISTORY_ADVISORY_LOCK_CLASS} AS INTEGER), hashtext(${clientId})) AS locked
  `;
  return Boolean(rows[0]?.locked);
}

function activeReserved(qty: unknown, consumed: unknown, released: unknown): Prisma.Decimal {
  const left = toDecimal(qty).minus(toDecimal(consumed)).minus(toDecimal(released));
  return left.greaterThan(0) ? left : new Prisma.Decimal(0);
}

type ReservationReleaseRow = {
  id: string;
  inventoryId: string;
  inventoryLayerId: string | null;
  qty: unknown;
  consumedQty: unknown;
  releasedQty: unknown;
};

/** Tasks have no InventoryReservation FK; deleting tasks never requires releasing stock. */
export function taskCleanupTouchesReservations(): false {
  return false;
}

async function releaseSelectedReservations(
  tx: Prisma.TransactionClient,
  reservations: ReservationReleaseRow[]
): Promise<number> {
  for (const row of reservations) {
    const qty = activeReserved(row.qty, row.consumedQty, row.releasedQty);
    if (qty.greaterThan(0)) {
      if (row.inventoryLayerId) {
        await tx.inventoryLayer.update({
          where: { id: row.inventoryLayerId },
          data: { reservedQty: { decrement: qty } }
        });
      }
      await tx.inventory.update({
        where: { id: row.inventoryId },
        data: { reservedQty: { decrement: qty } }
      });
    }
  }
  if (reservations.length) {
    await tx.inventoryReservation.deleteMany({ where: { id: { in: reservations.map((row) => row.id) } } });
  }
  return reservations.length;
}

async function releaseReservationsForAviatRequisitions(
  tx: Prisma.TransactionClient,
  clientId: string,
  requisitionIds: string[]
): Promise<number> {
  if (!requisitionIds.length) return 0;
  const reservations = await tx.inventoryReservation.findMany({
    where: {
      requisitionLine: {
        requisitionId: { in: requisitionIds },
        requisition: { project: { clientId } }
      }
    },
    select: {
      id: true,
      inventoryId: true,
      inventoryLayerId: true,
      qty: true,
      consumedQty: true,
      releasedQty: true
    }
  });
  return releaseSelectedReservations(tx, reservations);
}

async function purgeSelectedHistory(
  tx: Prisma.TransactionClient,
  aviatId: string,
  categories: HistoryCategory[],
  incidentIds: string[],
  incidentTypes: string[]
): Promise<OperationalHistoryCleanupResult["deleted"]> {
  const deleted: OperationalHistoryCleanupResult["deleted"] = {
    movements: 0,
    scanEvents: 0,
    activityLogs: 0,
    tasks: 0,
    requisitions: 0,
    importBatches: 0,
    incidents: 0,
    comments: 0,
    reservationsReleased: 0
  };
  const clientWhere = { clientId: aviatId };
  const projectWhere = { project: { clientId: aviatId } };

  if (categories.includes("movements")) {
    await tx.inventoryMovement.updateMany({
      where: clientWhere,
      data: { inventorySerialId: null, inventoryLayerId: null, requisitionLineId: null, taskId: null }
    });
    deleted.movements = (await tx.inventoryMovement.deleteMany({ where: clientWhere })).count;
  }

  if (categories.includes("scanEvents")) {
    deleted.scanEvents = (await tx.scanEvent.deleteMany({ where: clientWhere })).count;
  }

  if (categories.includes("activityLogs")) {
    deleted.activityLogs = (await tx.activityLog.deleteMany({ where: clientWhere })).count;
  }

  if (categories.includes("tasks")) {
    const taskIds = (await tx.task.findMany({ where: clientWhere, select: { id: true } })).map((row) => row.id);
    if (taskIds.length) {
      await tx.task.updateMany({ where: { id: { in: taskIds } }, data: { requisitionId: null } });
      deleted.tasks = (await tx.task.deleteMany({ where: { id: { in: taskIds } } })).count;
    }
  }

  if (categories.includes("requisitions")) {
    const requisitionIds = (
      await tx.requisition.findMany({ where: projectWhere, select: { id: true } })
    ).map((row) => row.id);
    deleted.reservationsReleased = await releaseReservationsForAviatRequisitions(tx, aviatId, requisitionIds);
    if (requisitionIds.length) {
      deleted.requisitions = (
        await tx.requisition.deleteMany({
          where: { AND: [{ id: { in: requisitionIds } }, projectWhere] }
        })
      ).count;
    }
  }

  if (categories.includes("importBatches")) {
    deleted.importBatches = (await tx.importBatch.deleteMany({ where: { clientId: aviatId } })).count;
  }

  if (categories.includes("incidents")) {
    const where: Prisma.IncidentWhereInput = {
      clientId: aviatId,
      ...(incidentIds.length ? { id: { in: incidentIds } } : {}),
      ...(incidentTypes.length ? { type: { in: incidentTypes } } : {})
    };
    deleted.incidents = (await tx.incident.deleteMany({ where })).count;
  }

  if (categories.includes("comments")) {
    deleted.comments = (await tx.comment.deleteMany({ where: clientWhere })).count;
  }

  return deleted;
}

async function leftoverCounts(tx: Prisma.TransactionClient, clientId: string) {
  const projectWhere = { project: { clientId } };
  const [movements, scanEvents, activityLogs, tasks, requisitions, importBatches, incidents, comments] =
    await Promise.all([
      tx.inventoryMovement.count({ where: { clientId } }),
      tx.scanEvent.count({ where: { clientId } }),
      tx.activityLog.count({ where: { clientId } }),
      tx.task.count({ where: { clientId } }),
      tx.requisition.count({ where: projectWhere }),
      tx.importBatch.count({ where: { clientId } }),
      tx.incident.count({ where: { clientId } }),
      tx.comment.count({ where: { clientId } })
    ]);
  return { movements, scanEvents, activityLogs, tasks, requisitions, importBatches, incidents, comments };
}

export async function previewOperationalHistoryCleanup(
  actor: { clientId: string },
  db: HistoryDb = prisma
): Promise<OperationalHistoryPreview> {
  return db.$transaction(async (tx) => {
    const aviatId = await resolveUniqueAviatClientId(tx);
    const isAviat = actor.clientId === aviatId;
    const mastersRetained = await countMasters(tx);
    const emptyCounts = {
      movements: { total: 0, selectable: true as const },
      scanEvents: { total: 0, selectable: true as const },
      activityLogs: { total: 0, selectable: true as const },
      tasks: { total: 0, selectable: true as const },
      requisitions: { total: 0, selectable: true as const },
      importBatches: { total: 0, selectable: true as const },
      incidents: emptyIncidents(),
      comments: { total: 0, selectable: true as const },
      reservationsToRelease: 0
    };
    const emptyCovered = {
      inventories: 0,
      movements: 0,
      scanEvents: 0,
      activityLogs: 0,
      tasks: 0,
      requisitions: 0,
      importBatches: 0
    };
    const integrityBase = {
      cannotPurgeWithoutTouchingMasters: [] as Array<{ category: string; reason: string }>,
      reservationsToRelease: 0,
      reservationsNote:
        "Las reservas AVIAT se liberan solo al limpiar la categoría requisiciones, y únicamente las ligadas a esas requisiciones. Limpiar tareas no toca reservas ni reservedQty. No se borra existencia ni maestros.",
      globalActivityLogsRetained: 0
    };

    if (!isAviat) {
      return {
        separateFromInventoryReset: true,
        executesAutomatically: false,
        clientId: actor.clientId,
        isAviat,
        policy: OPERATIONAL_HISTORY_POLICY,
        decision: OPERATIONAL_HISTORY_POLICY,
        decisionReason:
          "El preview solo enumera historial del cliente AVIAT activo. Cambia el contexto operativo a AVIAT. CLEAN_START no toca GitHub ni el historial técnico del repositorio.",
        canReachZeroOperationalHistory: false,
        inventoryResetDoesNotDelete: ["incidents", "comments"],
        historyCleanupDeletes: [...HISTORY_CATEGORIES],
        mastersPreserved: MASTERS_PRESERVED,
        ...REPOSITORY_GUARD,
        counts: emptyCounts,
        leftoverOutsideInventoryReset: { incidents: emptyIncidents(), comments: { total: 0 } },
        coveredByInventoryReset: emptyCovered,
        integrity: integrityBase,
        mastersRetained
      };
    }

    const [covered, incidents, comments, reservationsToRelease, globalActivityLogsRetained] = await Promise.all([
      countCoveredByInventoryReset(tx, aviatId),
      collectIncidentPreview(tx, aviatId),
      tx.comment.count({ where: { clientId: aviatId } }),
      countReservationsToRelease(tx, aviatId),
      tx.activityLog.count({ where: { clientId: null } })
    ]);

    return {
      separateFromInventoryReset: true,
      executesAutomatically: false,
      clientId: actor.clientId,
      isAviat,
      policy: OPERATIONAL_HISTORY_POLICY,
      decision: OPERATIONAL_HISTORY_POLICY,
      decisionReason:
        "CLEAN_START: solo datos operativos de AVIAT en base de datos (movimientos, scans, activity, tareas, requisiciones, imports, incidencias y comentarios) pueden llevarse a cero. No borra historia de GitHub, commits, ramas, PRs ni evidencia técnica. No se ejecuta sola. Maestros e inventario físico se conservan.",
      canReachZeroOperationalHistory: true,
      inventoryResetDoesNotDelete: ["incidents", "comments"],
      historyCleanupDeletes: [...HISTORY_CATEGORIES],
      mastersPreserved: MASTERS_PRESERVED,
      ...REPOSITORY_GUARD,
      counts: {
        movements: { total: covered.movements, selectable: true },
        scanEvents: { total: covered.scanEvents, selectable: true },
        activityLogs: { total: covered.activityLogs, selectable: true },
        tasks: { total: covered.tasks, selectable: true },
        requisitions: { total: covered.requisitions, selectable: true },
        importBatches: { total: covered.importBatches, selectable: true },
        incidents,
        comments: { total: comments, selectable: true },
        reservationsToRelease
      },
      leftoverOutsideInventoryReset: {
        incidents,
        comments: { total: comments }
      },
      coveredByInventoryReset: covered,
      integrity: {
        cannotPurgeWithoutTouchingMasters: [],
        reservationsToRelease,
        reservationsNote: integrityBase.reservationsNote,
        globalActivityLogsRetained
      },
      mastersRetained
    };
  });
}

export async function executeOperationalHistoryCleanup(
  actor: { userId: string; clientId: string },
  input: { confirmation?: unknown; categories?: unknown; incidentIds?: unknown; incidentTypes?: unknown },
  db: HistoryDb = prisma
): Promise<OperationalHistoryCleanupResult> {
  assertOperationalHistoryConfirmation(input.confirmation);
  const selection = assertHistoryCategorySelection(input);

  return db.$transaction(async (tx) => {
    const aviatId = await resolveUniqueAviatClientId(tx);
    assertAviatOperationalClient(actor.clientId, aviatId);
    const locked = await tryAcquireOperationalHistoryLock(tx, aviatId);
    if (!locked) {
      throw new HttpError(
        409,
        "Ya hay una limpieza de historial operativo en curso.",
        "OPERATIONAL_HISTORY_IN_FLIGHT"
      );
    }
    const deleted = await purgeSelectedHistory(
      tx,
      aviatId,
      selection.categories,
      selection.incidentIds,
      selection.incidentTypes
    );
    const leftover = await leftoverCounts(tx, aviatId);
    const reachedZeroOperationalHistory = HISTORY_CATEGORIES.every((key) => leftover[key] === 0);
    return {
      ok: true,
      executed: true,
      clientId: aviatId,
      deleted,
      leftover,
      reachedZeroOperationalHistory,
      untouchedOtherClient: true,
      mastersUntouched: true,
      doesNotTouchGitHub: true,
      repositoryUntouched: true
    };
  });
}
