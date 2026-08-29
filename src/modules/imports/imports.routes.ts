import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { requireAuth, requireRole } from "../../middlewares/auth.middleware.js";
import { HttpError } from "../../shared/http-error.js";
import { requireOperationalClient } from "../clients/client-scope.js";
import { buildSuggestedMapping, type CanonicalField, type ImportContext } from "./import-mapping.js";
import { parseUpload } from "./import-parse.service.js";
import { buildInventoryReconcileDiff, validateMappedRows } from "./import-validate.service.js";
import { executeImportBatch, ImportExecuteError } from "./import-execute.service.js";
import {
  IMPORT_CORRECTION_FIELDS,
  assertImportConfirmable,
  assignmentAuditPayload,
  buildAssignmentCorrection,
  buildReviewGroups,
  collectMissingLocations,
  selectReviewTargets
} from "./import-review.service.js";
import {
  CANCELLABLE_IMPORT_STATUSES,
  RESUMABLE_IMPORT_STATUSES,
  assertImportBatchMutable,
  buildCancelledImportMetadata,
  buildImportResumePayload,
  countUnresolved,
  importConfirmability,
  latestTimestamp
} from "./import-resume.service.js";
import { createMissingImportLocations } from "./import-missing-locations.service.js";

const importsRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 }
});

const contexts = ["INVENTORY", "INBOUND", "REQUISITIONS", "PRODUCTS", "CLIENTS_PROJECTS"] as const;

function asMeta(value: Prisma.JsonValue | null | undefined): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

async function loadBatch(id: string) {
  const batch = await prisma.importBatch.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, fullName: true, email: true } },
      rows: { orderBy: { sourceRow: "asc" } }
    }
  });
  if (!batch) throw new HttpError(404, "Importación no encontrada.");
  return batch;
}

importsRouter.use(requireAuth);
importsRouter.use(requireOperationalClient);

importsRouter.get("/", requireRole(["ADMIN", "SUPERVISOR"]), async (_req, res) => {
  const rows = await prisma.importBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { createdBy: { select: { id: true, fullName: true, email: true } } }
  });
  res.json(rows);
});

importsRouter.get("/active", requireRole(["ADMIN"]), async (req, res) => {
  const batch = await prisma.importBatch.findFirst({
    where: {
      createdById: req.auth!.userId,
      status: { in: [...RESUMABLE_IMPORT_STATUSES] }
    },
    orderBy: { createdAt: "desc" },
    include: {
      rows: {
        select: {
          reviewState: true,
          validatedAt: true,
          corrections: true,
          normalized: true
        }
      }
    }
  });
  if (!batch) {
    res.json({ available: false, import: null });
    return;
  }
  res.json({
    available: true,
    import: buildImportResumePayload(batch, { includeReview: false })
  });
});

importsRouter.post("/upload", requireRole(["ADMIN"]), upload.single("file"), async (req, res) => {
  const context = z.enum(contexts).parse(req.body.context);
  const inventoryMode = z.enum(["APPEND", "RECONCILE"]).optional().parse(req.body.inventoryMode) || "APPEND";
  const priceCurrency = z.enum(["MXN", "USD"]).optional().parse(req.body.priceCurrency);
  if (!req.file) throw new HttpError(400, "Archivo requerido.");
  const originalFileName = req.file.originalname || "upload.bin";
  if (/\.xlsm$/i.test(originalFileName)) throw new HttpError(400, "Archivos XLSM no estánidos.");
  let parsed;
  try {
    parsed = parseUpload(req.file.buffer, originalFileName);
  } catch (error) {
    const code = error instanceof Error ? error.message : "PARSE_ERROR";
    throw new HttpError(400, `No se pudo leer el archivo (${code}).`);
  }
  const first = parsed.sheets[0];
  const batch = await prisma.importBatch.create({
    data: {
      context,
      originalFileName,
      fileType: parsed.fileType,
      sheetName: first?.name || null,
      status: "UPLOADED",
      totalRows: first?.totalDataRows || 0,
      createdById: req.auth!.userId,
      metadata: {
        sheets: parsed.sheets.map((s) => ({
          name: s.name,
          headerRowIndex: s.headerRowIndex,
          headers: s.headers,
          totalDataRows: s.totalDataRows,
          rows: s.rows
        })),
        selectedSheet: first?.name || null,
        inventoryMode,
        priceCurrency: priceCurrency || null,
        parsedRows: first?.rows || []
      } as Prisma.InputJsonValue
    }
  });
  res.status(201).json(batch);
});

importsRouter.get("/:id/state", requireRole(["ADMIN"]), async (req, res) => {
  const batch = await loadBatch(z.string().min(1).parse(req.params.id));
  if (batch.createdById !== req.auth!.userId) {
    throw new HttpError(404, "Importación no encontrada.");
  }
  res.json(buildImportResumePayload(batch, { includeReview: true }));
});

importsRouter.get("/:id", requireRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  const batch = await loadBatch(z.string().min(1).parse(req.params.id));
  const meta = asMeta(batch.metadata);
  res.json({
    ...batch,
    rows: undefined,
    previewRows: batch.rows.slice(0, 50),
    sheetSummaries: meta.sheets || []
  });
});

importsRouter.post("/:id/select-sheet", requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const sheetName = z.string().min(1).parse(req.body.sheetName);
  const batch = await loadBatch(id);
  assertImportBatchMutable(batch.status);
  const meta = asMeta(batch.metadata);
  const sheet = (meta.sheets || []).find((s: any) => s.name === sheetName);
  if (!sheet) throw new HttpError(404, "Hoja no encontrada.");
  const updated = await prisma.importBatch.update({
    where: { id },
    data: {
      sheetName,
      totalRows: sheet.totalDataRows || 0,
      status: "UPLOADED",
      metadata: {
        ...meta,
        selectedSheet: sheetName,
        parsedRows: sheet.rows || [],
        mapping: undefined
      } as Prisma.InputJsonValue
    }
  });
  res.json(updated);
});

importsRouter.post("/:id/mapping", requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const batch = await loadBatch(id);
  assertImportBatchMutable(batch.status);
  const meta = asMeta(batch.metadata);
  const sheet =
    (meta.sheets || []).find((s: any) => s.name === (req.body.sheetName || batch.sheetName || meta.selectedSheet)) ||
    (meta.sheets || [])[0];
  if (!sheet) throw new HttpError(400, "Sin hoja seleccionada.");
  const mapping =
    req.body.mapping && typeof req.body.mapping === "object"
      ? (req.body.mapping as Record<string, CanonicalField | null>)
      : buildSuggestedMapping(sheet.headers || [], sheet.rows || []);
  const updated = await prisma.importBatch.update({
    where: { id },
    data: {
      status: "MAPPED",
      sheetName: sheet.name,
      metadata: { ...meta, mapping, selectedSheet: sheet.name } as Prisma.InputJsonValue
    }
  });
  res.json({ batch: updated, mapping, suggested: buildSuggestedMapping(sheet.headers || [], sheet.rows || []) });
});

importsRouter.post("/:id/validate", requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const batch = await loadBatch(id);
  assertImportBatchMutable(batch.status);
  const meta = asMeta(batch.metadata);
  const mapping = (meta.mapping || {}) as Record<string, CanonicalField | null>;
  if (!Object.keys(mapping).length) throw new HttpError(400, "Define el mapeo antes de validar.");
  const sourceRows = (meta.parsedRows || []) as Array<Record<string, unknown>>;
  if (!sourceRows.length) throw new HttpError(400, "No hay filas parseadas para validar. Vuelve a subir el archivo.");
  const existingRows = await prisma.importRow.findMany({ where: { importBatchId: id } });
  const correctionsBySourceRow = new Map(
    existingRows.map((row) => [row.sourceRow, asMeta(row.corrections)])
  );
  const validated = await validateMappedRows(batch.context as ImportContext, sourceRows, mapping, {
    inventoryMode: meta.inventoryMode,
    priceCurrency: meta.priceCurrency,
    correctionsBySourceRow,
    clientId: req.auth!.operationalClientId!
  });
  const existingBySource = new Map(existingRows.map((row) => [row.sourceRow, row]));
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
      ? await buildInventoryReconcileDiff(validated.rows, req.auth!.operationalClientId!)
      : null;
  const missingLocationSummary = validated.rows.reduce<Record<string, { code: string; sourceRows: number[]; records: number }>>(
    (summary, row) => {
      for (const issue of row.errors) {
        if (issue.code !== "SOURCE_LOCATION_NOT_IN_MASTER") continue;
        const code = String(issue.value || "").trim().toUpperCase();
        if (!code) continue;
        const entry = summary[code] || { code, sourceRows: [], records: 0 };
        entry.records += 1;
        entry.sourceRows.push(row.sourceRow);
        summary[code] = entry;
      }
      return summary;
    },
    {}
  );
  const requiredLocationsMissing = Object.values(missingLocationSummary)
    .sort((a, b) => b.records - a.records || a.code.localeCompare(b.code));
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
        valuation: validated.summary.valuation,
        reconcileDiff,
        requiredLocationsMissing,
        assignmentSummary: {
          totalRows: validated.summary.totalRows,
          customerBlank: validated.summary.customerBlank,
          freeToSaleAssigned: validated.summary.freeToSaleAssigned,
          projectAssigned: validated.summary.projectAssigned,
          assignmentUnresolved: validated.summary.assignmentUnresolved
        }
      } as Prisma.InputJsonValue
    }
  });
  res.json({
    batch: updated,
    summary: validated.summary,
    preview: validated.rows.slice(0, 50),
    reconcileDiff,
    requiredLocationsMissing
  });
});

importsRouter.get("/:id/preview", requireRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  const batch = await loadBatch(z.string().min(1).parse(req.params.id));
  res.json({
    id: batch.id,
    context: batch.context,
    status: batch.status,
    sheetName: batch.sheetName,
    totalRows: batch.totalRows,
    validRows: batch.validRows,
    invalidRows: batch.invalidRows,
    warningRows: batch.warningRows,
    metadata: batch.metadata,
    items: batch.rows.slice(0, 50)
  });
});

importsRouter.get("/:id/errors", requireRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const rows = await prisma.importRow.findMany({
    where: { importBatchId: id },
    orderBy: { sourceRow: "asc" }
  });
  res.json(
    rows
      .filter((r) => (Array.isArray(r.errors) && r.errors.length) || (Array.isArray(r.warnings) && r.warnings.length))
      .map((r) => ({
        sourceRow: r.sourceRow,
        errors: r.errors,
        warnings: r.warnings,
        action: r.action,
        normalized: r.normalized
      }))
  );
});

importsRouter.get("/:id/review", requireRole(["ADMIN"]), async (req, res) => {
  const batch = await loadBatch(z.string().min(1).parse(req.params.id));
  const match = {
    sku: z.string().trim().min(1).max(80).optional().parse(req.query.sku),
    lotNumber: z.string().trim().min(1).max(120).optional().parse(req.query.lotNumber),
    location: z.string().trim().min(1).max(120).optional().parse(req.query.location),
    status: z.string().trim().min(1).max(80).optional().parse(req.query.status),
    description: z.string().trim().min(1).max(160).optional().parse(req.query.q)
  };
  const review = buildReviewGroups(batch.rows, match);
  const confirm = importConfirmability(batch, batch.rows);
  res.json({
    id: batch.id,
    status: batch.status,
    totalRows: batch.totalRows,
    validRows: batch.validRows,
    invalidRows: batch.invalidRows,
    warningRows: batch.warningRows,
    counts: review.counts,
    unresolvedCount: countUnresolved(batch.rows),
    confirmable: confirm.confirmable,
    confirmableReason: confirm.reason,
    lastUpdated: latestTimestamp([
      batch.createdAt,
      batch.confirmedAt,
      batch.completedAt,
      ...batch.rows.map((row) => row.validatedAt)
    ]),
    filters: match,
    globalNotices: batch.context === "INVENTORY" && asMeta(batch.metadata).inventoryMode === "RECONCILE"
      ? [{ code: "RECONCILE_PREVIEW_ONLY", message: "Modo conciliación: vista previa únicamente. No se aplicarán cambios hasta confirmación autorizada." }]
      : [],
    groups: review.groups,
    missingLocations: collectMissingLocations(batch.rows).map((item) => ({ code: item.code, records: item.records })),
    rows: review.rows.slice(0, 200)
  });
});

const correctionFields = IMPORT_CORRECTION_FIELDS;
importsRouter.patch("/:id/review", requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const field = z.enum(correctionFields).parse(req.body.field);
  const value = req.body.value ?? null;
  const scope = z.enum(["SINGLE", "SELECTED", "ALL_MATCHING"]).parse(req.body.scope || "SINGLE");
  const sourceRows = z.array(z.number().int().positive()).optional().parse(req.body.sourceRows);
  const issueCode = z.string().optional().parse(req.body.issueCode);
  const issueValue = req.body.issueValue;
  const reason = z.string().max(500).optional().parse(req.body.reason);
  const match = z.object({
    sku: z.string().trim().min(1).max(80).optional(),
    lotNumber: z.string().trim().min(1).max(120).optional(),
    location: z.string().trim().min(1).max(120).optional(),
    status: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().min(1).max(160).optional()
  }).optional().parse(req.body.match);
  const batch = await loadBatch(id);
  assertImportBatchMutable(batch.status);
  if (["SERIAL_DUPLICATE_FILE", "SERIAL_EXISTS", "SERIAL_QTY", "IMEI_DUPLICATE_FILE", "IMEI_EXISTS"].includes(String(issueCode || ""))) {
    throw new HttpError(409, "Este conflicto de identidad requiere revisión individual.");
  }
  const targets = selectReviewTargets(batch.rows, { scope, sourceRows, issueCode, issueValue, match });
  await prisma.$transaction(targets.flatMap((row) => {
    const corrections = asMeta(row.corrections);
    const assignmentPatch = buildAssignmentCorrection(field, value);
    const nextCorrections = { ...corrections, ...assignmentPatch };
    const audit = assignmentAuditPayload(row, field, value);
    const auditField = field === "assignmentType" || field === "project" ? "assignment" : field;
    const previous = field === "assignmentType" || field === "project"
      ? audit.original
      : (corrections[field] ?? (row.normalized as any)?.[field] ?? null);
    return [
      prisma.importRow.update({ where: { id: row.id }, data: { corrections: nextCorrections as Prisma.InputJsonValue, reviewState: "WARNING" } }),
      prisma.importRowAudit.create({
        data: {
          importRowId: row.id,
          actorId: req.auth!.userId,
          field: auditField,
          original: audit.original as Prisma.InputJsonValue,
          previous: previous as Prisma.InputJsonValue,
          next: audit.next as Prisma.InputJsonValue,
          scope,
          reason: reason || null
        }
      })
    ];
  }));
  res.json({ corrected: targets.length, sourceRows: targets.map((row) => row.sourceRow), revalidateRequired: true });
});

importsRouter.post("/:id/review/missing-locations", requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const batch = await prisma.importBatch.findUnique({
    where: { id },
    select: { id: true, status: true }
  });
  if (!batch) throw new HttpError(404, "Importación no encontrada.");
  assertImportBatchMutable(batch.status);
  const confirmPhysical = z.literal(true).parse(req.body.confirmPhysical);
  const result = await createMissingImportLocations({
    batchId: id,
    userId: req.auth!.userId,
    confirmPhysical
  });
  res.json(result);
});

importsRouter.post("/:id/review/ignore", requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const batch = await prisma.importBatch.findUnique({
    where: { id },
    select: { id: true, status: true }
  });
  if (!batch) throw new HttpError(404, "Importación no encontrada.");
  assertImportBatchMutable(batch.status);
  const sourceRows = z.array(z.number().int().positive()).min(1).parse(req.body.sourceRows);
  const rows = await prisma.importRow.findMany({ where: { importBatchId: id, sourceRow: { in: sourceRows } } });
  await prisma.$transaction(rows.flatMap((row) => [
    prisma.importRow.update({ where: { id: row.id }, data: { reviewState: "IGNORED", ignoredAt: new Date(), ignoredById: req.auth!.userId } }),
    prisma.importRowAudit.create({ data: { importRowId: row.id, actorId: req.auth!.userId, field: "__row__", scope: "SINGLE", reason: "IGNORED_BY_ADMIN" } })
  ]));
  res.json({ ignored: rows.length });
});

importsRouter.get("/:id/normalized.csv", requireRole(["ADMIN", "SUPERVISOR"]), async (req, res) => {
  const batch = await loadBatch(z.string().min(1).parse(req.params.id));
  const headers = [
    "sourceRow",
    "sku",
    "qty",
    "location",
    "status",
    "lotNumber",
    "serialNumber",
    "imei",
    "unitPriceMxn",
    "unitPriceUsd",
    "sourceCustomer",
    "assignmentType",
    "projectId",
    "projectCode",
    "projectName",
    "client",
    "reference",
    "action",
    "reviewState"
  ];
  const lines = [headers.join(",")];
  for (const row of batch.rows) {
    const n = asMeta(row.normalized);
    lines.push(
      [
        row.sourceRow,
        n.sku || "",
        n.qty ?? "",
        n.location || "",
        n.status || "",
        n.lotNumber || "",
        n.serialNumber || "",
        n.imei || "",
        n.unitPriceMxn ?? "",
        n.unitPriceUsd ?? "",
        n.sourceCustomer ?? n.project ?? "",
        n.assignmentType || "",
        n.projectId || "",
        n.projectCode || "",
        n.projectName || "",
        n.clientName || n.client || "",
        n.reference || "",
        row.action || "",
        row.reviewState || ""
      ]
        .map((v) => {
          const s = String(v ?? "");
          return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(",")
    );
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="import_${batch.id}_normalized.csv"`);
  res.send(`\uFEFF${lines.join("\r\n")}`);
});

importsRouter.post("/:id/cancel", requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const userId = req.auth!.userId;
  const existing = await prisma.importBatch.findUnique({
    where: { id },
    select: { id: true, createdById: true }
  });
  if (!existing || existing.createdById !== userId) {
    throw new HttpError(404, "Importación no encontrada.");
  }
  const deletedStagingRows = await prisma.$transaction(async (tx) => {
    const claimed = await tx.importBatch.updateMany({
      where: {
        id,
        createdById: userId,
        status: { in: [...CANCELLABLE_IMPORT_STATUSES] }
      },
      data: {
        status: "CANCELLED",
        confirmedAt: null,
        completedAt: null
      }
    });
    if (claimed.count !== 1) {
      throw new HttpError(409, "La importación no puede cancelarse porque ya está en proceso, confirmada o cancelada.");
    }
    const batch = await tx.importBatch.findUnique({
      where: { id },
      select: { metadata: true }
    });
    const deleted = await tx.importRow.deleteMany({ where: { importBatchId: id } });
    await tx.importBatch.update({
      where: { id },
      data: {
        metadata: buildCancelledImportMetadata(batch?.metadata, { cancelledById: userId }) as Prisma.InputJsonValue
      }
    });
    return deleted.count;
  });
  res.json({
    id,
    status: "CANCELLED",
    deletedStagingRows,
    inventoryChanged: false
  });
});

importsRouter.post("/:id/confirm", requireRole(["ADMIN"]), async (req, res) => {
  const id = z.string().min(1).parse(req.params.id);
  const batch = await loadBatch(id);
  assertImportBatchMutable(batch.status);
  const meta = asMeta(batch.metadata);
  if (meta.inventoryMode === "RECONCILE") {
    const blocked = batch.rows.filter((row) => row.reviewState === "BLOCKED").length;
    if (blocked > 0) {
      throw new HttpError(409, `Existen ${blocked} registros pendientes de corrección. RECONCILE no permite confirmación parcial.`);
    }
    throw new HttpError(409, "RECONCILE bloqueado en este cambio. Solo preview/diff autorizado.");
  }
  assertImportConfirmable(batch.rows);
  const blockedRows = batch.rows.filter((row) => row.reviewState === "BLOCKED").length;
  if (batch.invalidRows > 0 || blockedRows > 0) {
    throw new HttpError(409, `Existen ${blockedRows || batch.invalidRows} registros pendientes de corrección.`);
  }
  const claimed = await prisma.importBatch.updateMany({
    where: { id, status: { in: ["READY", "VALIDATED"] } },
    data: { status: "PROCESSING", confirmedAt: new Date() }
  });
  if (claimed.count !== 1) {
    throw new HttpError(409, "La importación ya está en proceso o no está lista para confirmar.");
  }
  try {
    const execRows = batch.rows
      .filter((r) => r.reviewState !== "IGNORED")
      .map((r) => ({
        sourceRow: r.sourceRow,
        normalized: asMeta(r.normalized),
        errors: (r.errors as unknown[]) || [],
        action: r.action
      }));
    const isInventory = batch.context === "INVENTORY" || batch.context === "INBOUND";
    const results = await executeImportBatch({
      context: batch.context as ImportContext,
      rows: execRows,
      userId: req.auth!.userId,
      clientId: req.auth!.operationalClientId!,
      inventoryMode: meta.inventoryMode,
      batchId: id,
      metadata: meta
    });
    const failed = results.filter((r) => !r.ok);
    if (failed.length && isInventory) {
      throw new ImportExecuteError(failed[0]?.message || "IMPORT_ROW_FAILED", failed[0]?.sourceRow);
    }
    if (isInventory) {
      const updated = await prisma.importBatch.findUnique({ where: { id } });
      if (!updated || updated.status !== "COMPLETED" || !updated.completedAt) {
        throw new ImportExecuteError("IMPORT_BATCH_NOT_COMPLETED");
      }
      res.json({ batch: updated, results });
      return;
    }
    const updated = await prisma.importBatch.update({
      where: { id },
      data: {
        status: failed.length ? "FAILED" : "COMPLETED",
        completedAt: new Date(),
        metadata: { ...meta, execution: { results, failed: failed.length } } as Prisma.InputJsonValue
      }
    });
    res.json({ batch: updated, results });
  } catch (error) {
    const isInventory = batch.context === "INVENTORY" || batch.context === "INBOUND";
    await prisma.importBatch.update({
      where: { id },
      data: isInventory
        ? {
            status: "READY",
            confirmedAt: null,
            completedAt: null,
            metadata: {
              ...meta,
              lastFailedAttempt: {
                at: new Date().toISOString(),
                sourceRow: error instanceof ImportExecuteError ? error.sourceRow : null,
                error: error instanceof Error ? error.message : "IMPORT_FAILED"
              }
            } as Prisma.InputJsonValue
          }
        : {
            status: "FAILED",
            completedAt: new Date(),
            metadata: {
              ...meta,
              executionError: error instanceof Error ? error.message : "FAILED"
            } as Prisma.InputJsonValue
          }
    });
    if (isInventory) {
      throw new HttpError(
        409,
        error instanceof Error
          ? `No se pudo confirmar. La importación no escribió inventario y sigue disponible para reintentar. ${error.message}`
          : "No se pudo confirmar. La importación sigue disponible para reintentar."
      );
    }
    throw error;
  }
});

export { importsRouter };
