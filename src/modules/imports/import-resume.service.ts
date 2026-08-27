import { Prisma } from "@prisma/client";
import { HttpError } from "../../shared/http-error.js";
import { summarizeImportAssignments } from "./import-assignment.js";
import { assertImportConfirmable, buildReviewGroups, collectMissingLocations } from "./import-review.service.js";

export const RESUMABLE_IMPORT_STATUSES = ["UPLOADED", "MAPPED", "VALIDATED", "READY", "PROCESSING"] as const;
export const CANCELLABLE_IMPORT_STATUSES = ["UPLOADED", "MAPPED", "VALIDATED", "READY", "FAILED"] as const;
export const TERMINAL_IMPORT_STATUSES = ["PROCESSING", "COMPLETED", "CANCELLED"] as const;

export type ResumableImportStatus = (typeof RESUMABLE_IMPORT_STATUSES)[number];
export type CancellableImportStatus = (typeof CANCELLABLE_IMPORT_STATUSES)[number];

type ResumeRow = {
  reviewState: string;
  validatedAt?: Date | null;
  corrections?: Prisma.JsonValue | null;
  normalized?: Prisma.JsonValue | null;
  errors?: Prisma.JsonValue | null;
  warnings?: Prisma.JsonValue | null;
  data?: Prisma.JsonValue;
  sourceRow?: number;
  id?: string;
  action?: string | null;
};

function asMeta(value: Prisma.JsonValue | null | undefined): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

export function isResumableImportStatus(status: string): status is ResumableImportStatus {
  return (RESUMABLE_IMPORT_STATUSES as readonly string[]).includes(status);
}

export function isCancellableImportStatus(status: string): status is CancellableImportStatus {
  return (CANCELLABLE_IMPORT_STATUSES as readonly string[]).includes(status);
}

export function isMutableImportStatus(status: string): boolean {
  return !(TERMINAL_IMPORT_STATUSES as readonly string[]).includes(status);
}

export function assertImportBatchMutable(status: string): void {
  if (isMutableImportStatus(status)) return;
  if (status === "CANCELLED") {
    throw new HttpError(409, "La importación fue cancelada y no puede modificarse.");
  }
  if (status === "COMPLETED") {
    throw new HttpError(409, "La importación ya fue confirmada y no puede modificarse.");
  }
  if (status === "PROCESSING") {
    throw new HttpError(409, "La importación está en proceso de confirmación y no puede modificarse.");
  }
  throw new HttpError(409, "La importación no puede modificarse.");
}

export function buildCancelledImportMetadata(
  metadata: Prisma.JsonValue | null | undefined,
  options: { cancelledById: string; cancelledAt?: Date }
): Record<string, unknown> {
  const meta = asMeta(metadata);
  const mapping =
    meta.mapping && typeof meta.mapping === "object" && !Array.isArray(meta.mapping)
      ? { ...(meta.mapping as Record<string, unknown>) }
      : {};
  return {
    selectedSheet: meta.selectedSheet ?? null,
    inventoryMode: meta.inventoryMode ?? null,
    priceCurrency: meta.priceCurrency ?? null,
    mapping,
    valuation: meta.valuation ?? null,
    sheets: stripSheetRows(meta.sheets),
    cancelledAt: (options.cancelledAt ?? new Date()).toISOString(),
    cancelledById: options.cancelledById,
    cancelReason: "CANCELLED_BY_ADMIN"
  };
}

export function stripSheetRows(sheets: unknown): Array<{
  name: string;
  headerRowIndex: number | null;
  headers: string[];
  totalDataRows: number;
}> {
  if (!Array.isArray(sheets)) return [];
  return sheets.map((sheet) => {
    const item = sheet && typeof sheet === "object" ? (sheet as Record<string, any>) : {};
    return {
      name: String(item.name || ""),
      headerRowIndex: item.headerRowIndex == null ? null : Number(item.headerRowIndex),
      headers: Array.isArray(item.headers) ? item.headers.map((header: unknown) => String(header ?? "")) : [],
      totalDataRows: Number(item.totalDataRows || 0)
    };
  });
}

export function latestTimestamp(dates: Array<Date | string | null | undefined>): string | null {
  let max: Date | null = null;
  for (const value of dates) {
    if (!value) continue;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    if (!max || date > max) max = date;
  }
  return max ? max.toISOString() : null;
}

export function countUnresolved(rows: ResumeRow[]): number {
  return rows.filter((row) => {
    if (row.reviewState === "IGNORED") return false;
    return asMeta(row.normalized).assignmentType === "UNRESOLVED";
  }).length;
}

export function countCorrections(rows: ResumeRow[]): number {
  return rows.filter((row) => Object.keys(asMeta(row.corrections)).length > 0).length;
}

export function countAssignmentCorrections(rows: ResumeRow[]): number {
  return rows.filter((row) => {
    const corrections = asMeta(row.corrections);
    return Boolean(corrections.assignmentType || corrections.project);
  }).length;
}

export function importConfirmability(
  batch: { status: string; invalidRows: number; metadata: Prisma.JsonValue | null },
  rows: ResumeRow[]
): { confirmable: boolean; reason: string | null } {
  const meta = asMeta(batch.metadata);
  if (meta.inventoryMode === "RECONCILE") {
    return {
      confirmable: false,
      reason: "RECONCILE se confirma con Sustituir inventario físico, no con la confirmación genérica."
    };
  }
  if (batch.status === "CANCELLED") {
    return { confirmable: false, reason: "La importación fue cancelada." };
  }
  if (batch.status === "PROCESSING") {
    return { confirmable: false, reason: "La importación está en proceso de confirmación." };
  }
  if (batch.status === "COMPLETED") {
    return { confirmable: false, reason: "La importación ya fue confirmada." };
  }
  if (batch.status === "FAILED") {
    return { confirmable: false, reason: "La importación terminó con error." };
  }
  if (!["READY", "VALIDATED"].includes(batch.status)) {
    return { confirmable: false, reason: "La importación no está lista para confirmar." };
  }
  try {
    assertImportConfirmable(rows.map((row) => ({
      reviewState: row.reviewState,
      normalized: row.normalized ?? null
    })));
    const blocked = rows.filter((row) => row.reviewState === "BLOCKED").length;
    if (batch.invalidRows > 0 || blocked > 0) {
      return {
        confirmable: false,
        reason: `Existen ${blocked || batch.invalidRows} registros pendientes de corrección.`
      };
    }
    return { confirmable: true, reason: null };
  } catch (error) {
    return {
      confirmable: false,
      reason: error instanceof HttpError ? error.message : "No se puede confirmar."
    };
  }
}

export function buildImportResumePayload(
  batch: {
    id: string;
    context: string;
    originalFileName: string;
    sheetName: string | null;
    status: string;
    totalRows: number;
    validRows: number;
    invalidRows: number;
    warningRows: number;
    createdAt: Date;
    confirmedAt: Date | null;
    completedAt: Date | null;
    metadata: Prisma.JsonValue | null;
    rows: ResumeRow[];
  },
  options: { includeReview: boolean }
) {
  const meta = asMeta(batch.metadata);
  const mapping = meta.mapping && typeof meta.mapping === "object" ? meta.mapping : {};
  const sheets = stripSheetRows(meta.sheets);
  const selectedSheetName = String(batch.sheetName || meta.selectedSheet || sheets[0]?.name || "");
  const selectedSheet = sheets.find((sheet) => sheet.name === selectedSheetName) || sheets[0] || null;
  const counts = { READY: 0, WARNING: 0, BLOCKED: 0, IGNORED: 0 };
  for (const row of batch.rows) {
    const key = row.reviewState as keyof typeof counts;
    if (key in counts) counts[key] += 1;
  }
  const unresolvedCount = countUnresolved(batch.rows);
  const correctionsCount = countCorrections(batch.rows);
  const assignmentTypeCorrected = countAssignmentCorrections(batch.rows);
  const assignmentSummary = summarizeImportAssignments(
    batch.rows.map((row) => ({
      normalized: asMeta(row.normalized),
      errors: Array.isArray(row.errors) ? (row.errors as Array<{ code?: string }>) : [],
      reviewState: row.reviewState
    }))
  );
  const confirm = importConfirmability(batch, batch.rows);
  const hasMapping = Object.values(mapping).some((value) => Boolean(value));
  const lastUpdated = latestTimestamp([
    batch.createdAt,
    batch.confirmedAt,
    batch.completedAt,
    ...batch.rows.map((row) => row.validatedAt)
  ]);
  const payload: Record<string, unknown> = {
    id: batch.id,
    originalFileName: batch.originalFileName,
    context: batch.context,
    status: batch.status,
    sheetName: selectedSheetName || null,
    totalRows: batch.totalRows,
    validRows: batch.validRows,
    invalidRows: batch.invalidRows,
    warningRows: batch.warningRows,
    createdAt: batch.createdAt,
    confirmedAt: batch.confirmedAt,
    completedAt: batch.completedAt,
    lastUpdated,
    inventoryMode: meta.inventoryMode || "APPEND",
    sourceSha256: meta.sourceSha256 || null,
    priceCurrency: meta.priceCurrency || null,
    mapping,
    hasMapping,
    selectedSheet: selectedSheetName || null,
    sheets,
    sheetRows: Number(selectedSheet?.totalDataRows || batch.totalRows || 0),
    counts,
    unresolvedCount,
    hasUnresolved: unresolvedCount > 0,
    assignmentSummary,
    correctionsCount,
    assignmentTypeCorrected,
    confirmable: confirm.confirmable,
    confirmableReason: confirm.reason,
    validated: ["VALIDATED", "READY", "PROCESSING", "COMPLETED"].includes(batch.status) || batch.rows.length > 0,
    missingLocations: collectMissingLocations(
      batch.rows.map((row) => ({
        id: String(row.id || ""),
        sourceRow: Number(row.sourceRow || 0),
        reviewState: row.reviewState,
        data: row.data ?? {},
        corrections: row.corrections ?? null,
        normalized: row.normalized ?? null,
        errors: row.errors ?? null,
        warnings: row.warnings ?? null
      }))
    ).map((item) => ({ code: item.code, records: item.records }))
  };
  if (options.includeReview) {
    const review = buildReviewGroups(
      batch.rows.map((row) => ({
        id: String(row.id || ""),
        sourceRow: Number(row.sourceRow || 0),
        reviewState: row.reviewState,
        data: row.data ?? {},
        corrections: row.corrections ?? null,
        normalized: row.normalized ?? null,
        errors: row.errors ?? null,
        warnings: row.warnings ?? null
      }))
    );
    payload.previewRows = batch.rows.slice(0, 50).map((row) => ({
      sourceRow: row.sourceRow,
      action: row.action || null,
      reviewState: row.reviewState,
      errors: row.errors || [],
      warnings: row.warnings || [],
      normalized: row.normalized || {},
      data: row.data || {},
      corrections: row.corrections || {}
    }));
    payload.groups = review.groups;
    payload.rows = review.rows.slice(0, 200);
    payload.globalNotices =
      batch.context === "INVENTORY" && meta.inventoryMode === "RECONCILE"
        ? [
            {
              code: "RECONCILE_PREVIEW_ONLY",
              message: "Modo conciliación: vista previa únicamente. No se aplicarán cambios hasta confirmación autorizada."
            }
          ]
        : [];
  }
  return payload;
}
