import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { ensureCanonicalProductProject } from "../inventory/inventory-assignment.js";
import { createRequisition } from "../requisitions/requisition.service.js";
import { logActivity } from "../activity/activity-log.service.js";
import type { ImportContext } from "./import-mapping.js";
import { executeInventoryImportBulk, ImportExecuteError } from "./import-execute-bulk.service.js";

export { ImportExecuteError };

type ExecRow = {
  sourceRow: number;
  normalized: Record<string, unknown>;
  errors: unknown[];
  action?: string | null;
};

export function inventoryImportTransactionOptions(rowCount: number): { maxWait: number; timeout: number } {
  const perRowMs = 150;
  return {
    maxWait: 10_000,
    timeout: Math.max(30_000, Math.min(180_000, rowCount * perRowMs))
  };
}

function asMetaRecord(value: Record<string, unknown> | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

export async function executeImportBatch(input: {
  context: ImportContext;
  rows: ExecRow[];
  userId: string;
  clientId: string;
  inventoryMode?: "APPEND" | "RECONCILE";
  batchId?: string;
  metadata?: Record<string, unknown>;
}) {
  if (input.inventoryMode === "RECONCILE") {
    throw new Error("RECONCILE_CONFIRM_BLOCKED");
  }
  const valid = input.rows.filter((r) => !Array.isArray(r.errors) || r.errors.length === 0);
  const results: Array<{ sourceRow: number; ok: boolean; message?: string; productId?: string }> = [];

  if (input.context === "INVENTORY" || input.context === "INBOUND") {
    const batchId = input.batchId;
    if (!batchId) throw new ImportExecuteError("IMPORT_BATCH_ID_REQUIRED");
    const sourceMeta = asMetaRecord(input.metadata);
    return executeInventoryImportBulk({
      context: input.context,
      rows: valid,
      userId: input.userId,
      batchId,
      metadata: sourceMeta,
      txOptions: inventoryImportTransactionOptions(valid.length)
    });
  }

  if (input.context === "PRODUCTS") {
    for (const row of valid) {
      const n = row.normalized;
      const sku = String(n.sku || "");
      try {
        const existing = await prisma.product.findUnique({ where: { sku } });
        if (existing) {
          await prisma.product.update({
            where: { id: existing.id },
            data: {
              name: String(n.name || existing.name),
              barcode: n.barcode ? String(n.barcode) : existing.barcode,
              description: n.description ? String(n.description) : existing.description,
              unit: n.unit ? String(n.unit) : existing.unit,
              warehouse: n.warehouse ? String(n.warehouse) : existing.warehouse,
              customerId: n.projectId ? String(n.projectId) : existing.customerId,
              serialControlled: n.serialControlled != null ? Boolean(n.serialControlled) : existing.serialControlled,
              lotControlled: n.lotControlled != null ? Boolean(n.lotControlled) : existing.lotControlled
            }
          });
          await ensureCanonicalProductProject(prisma, existing.id, n.projectId ? String(n.projectId) : existing.customerId);
        } else {
          const created = await prisma.product.create({
            data: {
              sku,
              name: String(n.name || sku),
              barcode: n.barcode ? String(n.barcode) : null,
              description: n.description ? String(n.description) : null,
              unit: String(n.unit || "EA"),
              warehouse: String(n.warehouse || "TULTITLAN24"),
              customerId: n.projectId ? String(n.projectId) : null,
              serialControlled: Boolean(n.serialControlled),
              lotControlled: Boolean(n.lotControlled)
            }
          });
          await ensureCanonicalProductProject(prisma, created.id, created.customerId);
        }
        results.push({ sourceRow: row.sourceRow, ok: true });
      } catch (error) {
        results.push({ sourceRow: row.sourceRow, ok: false, message: error instanceof Error ? error.message : "PRODUCT_FAILED" });
      }
    }
    return results;
  }

  if (input.context === "REQUISITIONS") {
    const grouped = new Map<string, ExecRow[]>();
    for (const row of valid) {
      const key = String(row.normalized.requisitionNumber || "");
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(row);
    }
    for (const [number, lines] of grouped) {
      try {
        const projectCode = String(lines[0]!.normalized.projectCode || lines[0]!.normalized.project || "");
        await createRequisition({
          number,
          projectCode,
          priority: lines[0]!.normalized.priority ? String(lines[0]!.normalized.priority) : "NORMAL",
          reference: lines[0]!.normalized.reference ? String(lines[0]!.normalized.reference) : null,
          notes: lines[0]!.normalized.notes ? String(lines[0]!.normalized.notes) : null,
          userId: input.userId,
          lines: lines.map((line) => ({
            sku: String(line.normalized.sku),
            requestedQty: Number(line.normalized.qty || 0)
          }))
        });
        for (const line of lines) results.push({ sourceRow: line.sourceRow, ok: true });
      } catch (error) {
        for (const line of lines) {
          results.push({
            sourceRow: line.sourceRow,
            ok: false,
            message: error instanceof Error ? error.message : "REQUISITION_FAILED"
          });
        }
      }
    }
    return results;
  }

  if (input.context === "CLIENTS_PROJECTS") {
    for (const row of valid) {
      const n = row.normalized;
      try {
        const clientId = input.clientId;
        const projectCode = String(n.project || "").toUpperCase().replace(/\s+/g, "_").slice(0, 60);
        if (!projectCode) throw new Error("PROJECT_REQUIRED");
        const existing = await prisma.customer.findUnique({ where: { code: projectCode } });
        if (!existing) {
          await prisma.customer.create({
            data: {
              code: projectCode,
              name: String(n.project || projectCode),
              clientId,
              active: true
            }
          });
        } else if (existing.clientId !== clientId) {
          throw new Error("PROJECT_WRONG_CLIENT");
        }
        await logActivity({
          type: "IMPORT",
          subtype: "CLIENTS_PROJECTS",
          reference: projectCode,
          userId: input.userId,
          clientId,
          result: "OK"
        });
        results.push({ sourceRow: row.sourceRow, ok: true });
      } catch (error) {
        results.push({ sourceRow: row.sourceRow, ok: false, message: error instanceof Error ? error.message : "CLIENT_PROJECT_FAILED" });
      }
    }
    return results;
  }

  throw new Error("UNSUPPORTED_CONTEXT");
}
