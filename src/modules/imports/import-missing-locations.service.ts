import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../shared/http-error.js";
import { logActivity } from "../activity/activity-log.service.js";
import { collectMissingLocations, normalizeImportLocationCode } from "./import-review.service.js";

const inFlightByBatch = new Set<string>();
const LOCATION_CREATION_BATCH_STATUSES = new Set(["VALIDATED", "READY"]);
const MAX_LOCATIONS_PER_IMPORT = 100;
const SAFE_LOCATION_CODE = /^[A-Z0-9][A-Z0-9._/-]{0,79}$/;

export function assertImportLocationCreationAllowed(
  batch: { context: string; status: string; createdById: string },
  userId: string
): void {
  if (batch.createdById !== userId) {
    throw new HttpError(404, "Importación no encontrada.");
  }
  if (batch.context !== "INVENTORY") {
    throw new HttpError(409, "Solo se pueden crear ubicaciones desde una importación de inventario.");
  }
  if (!LOCATION_CREATION_BATCH_STATUSES.has(batch.status)) {
    throw new HttpError(409, "La importación debe estar validada antes de crear ubicaciones.");
  }
}

export function normalizeMissingLocationCodes(
  missing: Array<{ code: string }>
): string[] {
  const codes = [...new Set(
    missing
      .map((item) => normalizeImportLocationCode(item.code))
      .filter((code) => code.length > 0)
  )];
  if (!codes.length) {
    throw new HttpError(400, "No hay ubicaciones faltantes para dar de alta.");
  }
  if (codes.length > MAX_LOCATIONS_PER_IMPORT || codes.some((code) => !SAFE_LOCATION_CODE.test(code))) {
    throw new HttpError(400, "Hay demasiados códigos o existen códigos de ubicación inválidos.");
  }
  return codes;
}

async function resolveLocationTemplate() {
  const warehouses = await prisma.location.groupBy({
    by: ["warehouseId"],
    _count: { _all: true }
  });
  if (warehouses.length !== 1) {
    throw new HttpError(
      409,
      "No se puede determinar el almacén de forma inequívoca. No se crearon ubicaciones."
    );
  }
  const warehouseId = warehouses[0].warehouseId;
  const template = await prisma.location.findFirst({
    where: { warehouseId, active: true },
    select: { warehouseId: true, warehouse: true, zone: true, rack: true, level: true, position: true }
  });
  if (!template?.warehouseId || !template.warehouse || !template.zone || !template.rack || !template.level || !template.position) {
    throw new HttpError(
      409,
      "No hay una plantilla de ubicación existente para completar zona/rack/nivel/posición."
    );
  }
  return template;
}

export async function createMissingImportLocations(input: {
  batchId: string;
  clientId: string;
  userId: string;
  confirmPhysical: boolean;
}) {
  if (!input.confirmPhysical) {
    throw new HttpError(400, "Debes confirmar que las ubicaciones existen físicamente.");
  }
  if (inFlightByBatch.has(input.batchId)) {
    throw new HttpError(409, "Ya hay un alta de ubicaciones en curso para esta importación.");
  }
  inFlightByBatch.add(input.batchId);
  try {
    const batch = await prisma.importBatch.findFirst({
      where: { id: input.batchId, clientId: input.clientId },
      include: { rows: { select: { sourceRow: true, reviewState: true, errors: true, warnings: true } } }
    });
    if (!batch) throw new HttpError(404, "Importación no encontrada.");
    assertImportLocationCreationAllowed(batch, input.userId);

    const missing = collectMissingLocations(batch.rows);
    const codes = normalizeMissingLocationCodes(missing);

    const template = await resolveLocationTemplate();
    const existing = await prisma.location.findMany({
      where: { code: { in: codes } },
      select: { code: true }
    });
    const existingSet = new Set(existing.map((row) => row.code.toUpperCase()));
    const toCreate = codes.filter((code) => !existingSet.has(code));

    if (toCreate.length) {
      await prisma.location.createMany({
        data: toCreate.map((code) => ({
          warehouseId: template.warehouseId,
          warehouse: template.warehouse,
          zone: template.zone,
          rack: template.rack,
          level: template.level,
          position: template.position,
          code,
          active: true
        })),
        skipDuplicates: true
      });
    }

    const after = await prisma.location.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true, warehouse: true, zone: true, rack: true, level: true, position: true, active: true }
    });
    const afterSet = new Set(after.map((row) => row.code.toUpperCase()));
    const created = codes.filter((code) => !existingSet.has(code) && afterSet.has(code));
    const alreadyExisted = codes.filter((code) => existingSet.has(code));
    const recordsAffected = missing
      .filter((item) => afterSet.has(item.code))
      .reduce((sum, item) => sum + item.records, 0);

    await logActivity({
      type: "LOCATION_CREATE",
      subtype: "IMPORT_REVIEW",
      reference: batch.id,
      userId: input.userId,
      warehouse: template.warehouse,
      result: "OK",
      metadata: {
        importBatchId: batch.id,
        created,
        alreadyExisted,
        recordsAffected,
        fields: {
          warehouse: template.warehouse,
          zone: template.zone,
          rack: template.rack,
          level: template.level,
          position: template.position,
          code: "SOURCE_EXACT"
        }
      }
    });

    return {
      created,
      alreadyExisted,
      missing: missing.map((item) => ({ code: item.code, records: item.records })),
      recordsAffected,
      warehouse: template.warehouse,
      template: {
        warehouse: template.warehouse,
        zone: template.zone,
        rack: template.rack,
        level: template.level,
        position: template.position
      },
      locations: after
    };
  } finally {
    inFlightByBatch.delete(input.batchId);
  }
}
