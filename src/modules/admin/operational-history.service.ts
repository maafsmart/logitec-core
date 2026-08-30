import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../shared/http-error.js";
import {
  assertAviatOperationalClient,
  resolveUniqueAviatClientId
} from "../inventory/physical-reset.service.js";

export const OPERATIONAL_HISTORY_CONFIRMATION = "LIMPIAR HISTORIAL OPERATIVO DE AVIAT";
export const OPERATIONAL_HISTORY_DECISION = "REQUIERE_DECISION_INCIDENTS";

export type HistoryDb = {
  $transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number }
  ): Promise<T>;
};

export type HistoryCategory = "comments" | "incidents";

export type IncidentPreviewRow = {
  id: string;
  type: string;
  status: string;
  createdAt: Date | string;
  warehouse: string | null;
  notesPreview: string;
};

export type OperationalHistoryPreview = {
  separateFromInventoryReset: true;
  executesAutomatically: false;
  clientId: string;
  isAviat: boolean;
  decision: typeof OPERATIONAL_HISTORY_DECISION;
  decisionReason: string;
  coveredByInventoryReset: {
    inventories: number;
    movements: number;
    scanEvents: number;
    activityLogs: number;
    tasks: number;
    requisitions: number;
    importBatches: number;
  };
  leftoverOutsideInventoryReset: {
    incidents: {
      total: number;
      byType: Record<string, number>;
      byStatus: Record<string, number>;
      records: IncidentPreviewRow[];
    };
    comments: {
      total: number;
    };
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
  deleted: {
    incidents: number;
    comments: number;
  };
  untouchedOtherClient: true;
  mastersUntouched: true;
};

function notesPreview(notes: string | null | undefined): string {
  const text = String(notes || "").replace(/\s+/g, " ").trim();
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

function increment(map: Record<string, number>, key: string): void {
  map[key] = (map[key] || 0) + 1;
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
  const categories = raw.filter((item): item is HistoryCategory => item === "comments" || item === "incidents");
  if (!categories.length) {
    throw new HttpError(
      400,
      "Selecciona al menos una categoría (comments o incidents). El preview no ejecuta nada.",
      "HISTORY_CATEGORY_REQUIRED"
    );
  }
  const incidentIds = Array.isArray(input.incidentIds)
    ? [...new Set(input.incidentIds.map((item) => String(item).trim()).filter(Boolean))]
    : [];
  const incidentTypes = Array.isArray(input.incidentTypes)
    ? [...new Set(input.incidentTypes.map((item) => String(item).trim().toUpperCase()).filter(Boolean))]
    : [];
  if (categories.includes("incidents") && !incidentIds.length && !incidentTypes.length) {
    throw new HttpError(
      400,
      "Incident no distingue prueba vs real. Elige registros o tipos concretos; no hay borrado automático de todas las incidencias.",
      OPERATIONAL_HISTORY_DECISION
    );
  }
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

export async function previewOperationalHistoryCleanup(
  actor: { clientId: string },
  db: HistoryDb = prisma
): Promise<OperationalHistoryPreview> {
  return db.$transaction(async (tx) => {
    const aviatId = await resolveUniqueAviatClientId(tx);
    const isAviat = actor.clientId === aviatId;
    const emptyIncidents = { total: 0, byType: {}, byStatus: {}, records: [] as IncidentPreviewRow[] };
    if (!isAviat) {
      return {
        separateFromInventoryReset: true,
        executesAutomatically: false,
        clientId: actor.clientId,
        isAviat,
        decision: OPERATIONAL_HISTORY_DECISION,
        decisionReason:
          "El preview solo enumera historial del cliente AVIAT activo. Cambia el contexto operativo a AVIAT.",
        coveredByInventoryReset: {
          inventories: 0,
          movements: 0,
          scanEvents: 0,
          activityLogs: 0,
          tasks: 0,
          requisitions: 0,
          importBatches: 0
        },
        leftoverOutsideInventoryReset: { incidents: emptyIncidents, comments: { total: 0 } },
        mastersRetained: await countMasters(tx)
      };
    }

    const [incidents, comments, coveredByInventoryReset, mastersRetained] = await Promise.all([
      tx.incident.findMany({
        where: { clientId: aviatId },
        orderBy: { createdAt: "desc" },
        select: { id: true, type: true, status: true, createdAt: true, warehouse: true, notes: true }
      }),
      tx.comment.count({ where: { clientId: aviatId } }),
      countCoveredByInventoryReset(tx, aviatId),
      countMasters(tx)
    ]);

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

    return {
      separateFromInventoryReset: true,
      executesAutomatically: false,
      clientId: actor.clientId,
      isAviat,
      decision: OPERATIONAL_HISTORY_DECISION,
      decisionReason:
        "Incident no tiene marca prueba vs real. El reset de inventario no los borra. Selecciona categoría/registro; no hay limpieza automática.",
      coveredByInventoryReset,
      leftoverOutsideInventoryReset: {
        incidents: { total: incidents.length, byType, byStatus, records },
        comments: { total: comments }
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

    let incidentsDeleted = 0;
    let commentsDeleted = 0;

    if (selection.categories.includes("incidents")) {
      const where: Prisma.IncidentWhereInput = {
        clientId: aviatId,
        ...(selection.incidentIds.length ? { id: { in: selection.incidentIds } } : {}),
        ...(selection.incidentTypes.length ? { type: { in: selection.incidentTypes } } : {})
      };
      const result = await tx.incident.deleteMany({ where });
      incidentsDeleted = result.count;
    }

    if (selection.categories.includes("comments")) {
      const result = await tx.comment.deleteMany({ where: { clientId: aviatId } });
      commentsDeleted = result.count;
    }

    return {
      ok: true,
      executed: true,
      clientId: aviatId,
      deleted: { incidents: incidentsDeleted, comments: commentsDeleted },
      untouchedOtherClient: true,
      mastersUntouched: true
    };
  });
}
