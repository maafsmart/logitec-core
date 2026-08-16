import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { mutateInventoryInTransaction } from "../inventory/inventory-mutation.service.js";
import { ensureCanonicalProductProject } from "../inventory/inventory-assignment.js";
import { createRequisition } from "../requisitions/requisition.service.js";
import { logActivity } from "../activity/activity-log.service.js";
import type { ImportContext } from "./import-mapping.js";
import { toDecimal } from "./import-validate.service.js";

type ExecRow = {
  sourceRow: number;
  normalized: Record<string, unknown>;
  errors: unknown[];
  action?: string | null;
};

export async function executeImportBatch(input: {
  context: ImportContext;
  rows: ExecRow[];
  userId: string;
  inventoryMode?: "APPEND" | "RECONCILE";
}) {
  if (input.inventoryMode === "RECONCILE") {
    throw new Error("RECONCILE_CONFIRM_BLOCKED");
  }
  const valid = input.rows.filter((r) => !Array.isArray(r.errors) || r.errors.length === 0);
  const results: Array<{ sourceRow: number; ok: boolean; message?: string }> = [];

  if (input.context === "INVENTORY" || input.context === "INBOUND") {
    for (const row of valid) {
      const n = row.normalized;
      const sku = String(n.sku || "");
      try {
        await prisma.$transaction(async (tx) => {
          let productId = n.productId ? String(n.productId) : null;
          if (!productId) {
            const projectId = n.projectId ? String(n.projectId) : "";
            if (!projectId) throw new Error("NEW_SKU_PROJECT_REQUIRED");
            const created = await tx.product.create({
              data: {
                sku,
                name: String(n.name || sku),
                barcode: n.barcode ? String(n.barcode) : null,
                warehouse: String(n.warehouse || "TULTITLAN24"),
                customerId: projectId,
                serialControlled: Boolean(n.serialControlled),
                lotControlled: Boolean(n.lotControlled)
              }
            });
            productId = created.id;
            await ensureCanonicalProductProject(tx, created.id, projectId);
          }
          const locationId = String(n.locationId || "");
          const qty = toDecimal(n.qty) || new Prisma.Decimal(0);
          const status = String(n.status || "");
          if (!status) throw new Error("STATUS_REQUIRED");
          const result = await mutateInventoryInTransaction(tx, {
            type: "IN",
            productId,
            locationId,
            status,
            qty,
            lotNumber: n.lotNumber ? String(n.lotNumber) : null,
            unitPriceMxn: toDecimal(n.unitPriceMxn),
            unitPriceUsd: toDecimal(n.unitPriceUsd),
            reference: n.reference ? String(n.reference) : `IMPORT-${input.context}`,
            notes: n.notes ? String(n.notes) : null,
            userId: input.userId,
            activity: {
              type: "IMPORT",
              subtype: input.context,
              reference: sku,
              userId: input.userId,
              result: "OK"
            }
          });
          if (n.serialNumber) {
            await tx.inventorySerial.create({
              data: {
                productId,
                inventoryLayerId: result.layer.id,
                serialNumber: String(n.serialNumber),
                imei: n.imei ? String(n.imei) : null,
                receivedAt: new Date()
              }
            });
          }
        }, { maxWait: 5_000, timeout: 15_000 });
        results.push({ sourceRow: row.sourceRow, ok: true });
      } catch (error) {
        results.push({
          sourceRow: row.sourceRow,
          ok: false,
          message: error instanceof Error ? error.message : "IMPORT_ROW_FAILED"
        });
      }
    }
    return results;
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
        let clientId = n.clientId ? String(n.clientId) : null;
        if (!clientId) {
          const created = await prisma.client.create({
            data: {
              name: String(n.client || n.tradeName || n.legalName || "Cliente"),
              tradeName: n.tradeName ? String(n.tradeName) : null,
              legalName: n.legalName ? String(n.legalName) : null,
              rfc: n.rfc ? String(n.rfc) : null,
              email: n.email ? String(n.email) : null,
              phone: n.phone ? String(n.phone) : null,
              notes: n.notes ? String(n.notes) : null,
              active: true
            }
          });
          clientId = created.id;
        }
        const projectCode = String(n.project || "").toUpperCase().replace(/\s+/g, "_").slice(0, 60);
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
        } else if (!existing.clientId) {
          await prisma.customer.update({ where: { id: existing.id }, data: { clientId } });
        }
        await logActivity({
          type: "IMPORT",
          subtype: "CLIENTS_PROJECTS",
          reference: projectCode,
          userId: input.userId,
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
