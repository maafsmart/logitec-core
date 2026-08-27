import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../shared/http-error.js";
import { buildSuggestedMapping, type CanonicalField, type ImportContext } from "./import-mapping.js";
import { buildInventoryReconcileDiff, validateMappedRows } from "./import-validate.service.js";

function asMeta(value: Prisma.JsonValue | null | undefined): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

export async function revalidateImportBatch(id: string) {
  const batch = await prisma.importBatch.findUnique({
    where: { id },
    include: { rows: { select: { id: true, sourceRow: true, reviewState: true, corrections: true } } }
  });
  if (!batch) throw new HttpError(404, "Importación no encontrada.");
  const meta = asMeta(batch.metadata);
  const mapping = (meta.mapping || {}) as Record<string, CanonicalField | null>;
  if (!Object.keys(mapping).length) {
    const firstSheet = (meta.sheets || []).find((s: { name?: string }) => s.name === batch.sheetName) || (meta.sheets || [])[0];
    const suggested = buildSuggestedMapping(firstSheet?.headers || [], firstSheet?.rows || []);
    Object.assign(mapping, suggested);
  }
  if (!Object.keys(mapping).length) throw new HttpError(400, "Define el mapeo antes de validar.");
  const sourceRows = (meta.parsedRows || []) as Array<Record<string, unknown>>;
  if (!sourceRows.length) throw new HttpError(400, "No hay filas parseadas para validar. Vuelve a subir el archivo.");
  const correctionsBySourceRow = new Map(
    batch.rows.map((row) => [row.sourceRow, asMeta(row.corrections)])
  );
  const validated = await validateMappedRows(batch.context as ImportContext, sourceRows, mapping, {
    inventoryMode: meta.inventoryMode,
    priceCurrency: meta.priceCurrency,
    correctionsBySourceRow
  });
  const existingBySource = new Map(batch.rows.map((row) => [row.sourceRow, row]));
  const now = new Date();
  const toCreate: Prisma.ImportRowCreateManyInput[] = [];
  const toUpdate: Array<{ id: string; data: Prisma.ImportRowUpdateInput }> = [];
  for (const row of validated.rows) {
    const previous = existingBySource.get(row.sourceRow);
    const reviewState = previous?.reviewState === "IGNORED"
      ? "IGNORED"
      : row.errors.length ? "BLOCKED" : row.warnings.length ? "WARNING" : "READY";
    if (!previous) {
      toCreate.push({
        importBatchId: id,
        sourceRow: row.sourceRow,
        data: row.data as Prisma.InputJsonValue,
        corrections: (correctionsBySourceRow.get(row.sourceRow) || null) as Prisma.InputJsonValue,
        normalized: row.normalized as Prisma.InputJsonValue,
        errors: row.errors as Prisma.InputJsonValue,
        warnings: row.warnings as Prisma.InputJsonValue,
        action: row.action,
        reviewState,
        validatedAt: now
      });
    } else {
      toUpdate.push({
        id: previous.id,
        data: {
          normalized: row.normalized as Prisma.InputJsonValue,
          errors: row.errors as Prisma.InputJsonValue,
          warnings: row.warnings as Prisma.InputJsonValue,
          action: row.action,
          reviewState,
          validatedAt: now
        }
      });
    }
  }
  if (toCreate.length) {
    await prisma.importRow.createMany({ data: toCreate });
  }
  for (let i = 0; i < toUpdate.length; i += 100) {
    const chunk = toUpdate.slice(i, i + 100);
    await Promise.all(chunk.map((item) => prisma.importRow.update({ where: { id: item.id }, data: item.data })));
  }
  const reconcileDiff =
    batch.context === "INVENTORY" && meta.inventoryMode === "RECONCILE"
      ? await buildInventoryReconcileDiff(validated.rows)
      : null;
  const updated = await prisma.importBatch.update({
    where: { id },
    data: {
      status: validated.summary.invalidRows ? "VALIDATED" : "READY",
      totalRows: validated.summary.totalRows,
      validRows: validated.summary.validRows,
      invalidRows: validated.summary.invalidRows,
      warningRows: validated.summary.warningRows,
      metadata: {
        ...meta,
        mapping,
        valuation: validated.summary.valuation,
        reconcileDiff,
        assignmentSummary: {
          totalRows: validated.summary.totalRows,
          customerBlank: validated.summary.customerBlank,
          freeToSaleAssigned: validated.summary.freeToSaleAssigned,
          projectAssigned: validated.summary.projectAssigned,
          assignmentUnresolved: validated.summary.assignmentUnresolved
        }
      } as Prisma.InputJsonValue
    },
    include: { rows: { select: { reviewState: true } } }
  });
  return { batch: updated, summary: validated.summary };
}
