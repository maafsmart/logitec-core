import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { logActivity } from "../activity/activity-log.service.js";
import { HttpError } from "../../shared/http-error.js";
import { inventoryImportTransactionOptions } from "../imports/import-execute.service.js";
import {
  applyInventoryImportInTransaction,
  ImportExecuteError
} from "../imports/import-execute-bulk.service.js";
import { isSha256Hex, normalizeSha256 } from "../imports/import-file-hash.js";
import { revalidateImportBatch } from "../imports/import-revalidate.service.js";
import { assertImportConfirmable } from "../imports/import-review.service.js";
import { withPhysicalInventoryLock } from "./physical-inventory-lock.js";
import { zeroPhysicalInventoryState } from "./physical-reset.service.js";

export const PHYSICAL_CONFIRM_PHRASE = "SUSTITUIR INVENTARIO";
export const PHYSICAL_CONFIRM_PATH = "/api/v1/inventory/physical/confirm";
export const PHYSICAL_PREPARE_PATH = "/api/v1/inventory/physical/prepare";

export type PhysicalConfirmDb = {
  $transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number }
  ): Promise<T>;
};

function asMeta(value: Prisma.JsonValue | null | undefined): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, any>) } : {};
}

function decimalText(value: Prisma.Decimal | null | undefined): string {
  return value ? value.toString() : "0";
}

export function assertPhysicalConfirmPhrase(value: unknown): void {
  if (String(value ?? "").trim() !== PHYSICAL_CONFIRM_PHRASE) {
    throw new HttpError(400, `Para confirmar escribe exactamente: ${PHYSICAL_CONFIRM_PHRASE}`);
  }
}

export function assertSourceSha256(value: unknown): string {
  const sha = normalizeSha256(value);
  if (!isSha256Hex(sha)) {
    throw new HttpError(400, "SHA-256 inválido.");
  }
  return sha;
}

export function assertPhysicalShaMatch(stored: unknown, provided: string): void {
  const expected = normalizeSha256(stored);
  if (!isSha256Hex(expected)) {
    throw new HttpError(409, "El lote no tiene SHA-256 oficial. Prepáralo como RECONCILE primero.");
  }
  if (expected !== provided) {
    throw new HttpError(400, "SHA-256 incorrecto.");
  }
}

export type PhysicalBatchSnapshot = {
  id: string;
  context: string;
  status: string;
  originalFileName: string;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  confirmedAt: Date | null;
  completedAt: Date | null;
  metadata: Prisma.JsonValue | null;
  rows: Array<{
    sourceRow: number;
    reviewState: string;
    normalized: Prisma.JsonValue | null;
    errors: Prisma.JsonValue | null;
    action: string | null;
  }>;
};

export function inventoryModeOf(batch: { metadata: Prisma.JsonValue | null }): "APPEND" | "RECONCILE" {
  const mode = String(asMeta(batch.metadata).inventoryMode || "APPEND").toUpperCase();
  return mode === "RECONCILE" ? "RECONCILE" : "APPEND";
}

export function assertPhysicalBatchReady(batch: PhysicalBatchSnapshot): void {
  if (batch.context !== "INVENTORY") {
    throw new HttpError(409, "Solo se puede conciliar un lote de inventario físico.");
  }
  if (String(batch.originalFileName || "").toUpperCase().includes("PREPARADO")) {
    throw new HttpError(409, "No se puede conciliar un archivo PREPARADO.");
  }
  if (batch.status !== "READY") {
    throw new HttpError(409, "La importación debe estar READY.");
  }
  if (batch.invalidRows > 0 || batch.totalRows !== batch.validRows || batch.validRows <= 0) {
    throw new HttpError(409, "El lote debe tener 0 inválidas y todas las filas válidas.");
  }
  const blocked = batch.rows.filter((row) => row.reviewState === "BLOCKED").length;
  if (blocked > 0) {
    throw new HttpError(409, `Existen ${blocked} registros pendientes de corrección.`);
  }
  assertImportConfirmable(batch.rows);
}

export function assertPhysicalAppendBlocked(mode: "APPEND" | "RECONCILE", liveQty: Prisma.Decimal | number | string): void {
  const qty = new Prisma.Decimal(String(liveQty || 0));
  if (mode === "APPEND" && qty.gt(0)) {
    throw new HttpError(
      409,
      "No se puede confirmar un lote físico APPEND sobre inventario no vacío. Prepara conciliación RECONCILE."
    );
  }
}

export function stagedInventoryTotals(
  rows: PhysicalBatchSnapshot["rows"]
): { qty: Prisma.Decimal; products: number; locations: number; serialized: number; freeToSale: number } {
  const visible = rows.filter((row) => row.reviewState !== "IGNORED");
  let qty = new Prisma.Decimal(0);
  const products = new Set<string>();
  const locations = new Set<string>();
  let serialized = 0;
  let freeToSale = 0;
  for (const row of visible) {
    const n = asMeta(row.normalized);
    qty = qty.add(new Prisma.Decimal(String(n.qty || 0)));
    if (n.sku) products.add(String(n.sku).toUpperCase());
    if (n.location) locations.add(String(n.location).toUpperCase());
    if (n.serialNumber) serialized += 1;
    if (n.assignmentType === "FREE_TO_SALE") freeToSale += 1;
  }
  return { qty, products: products.size, locations: locations.size, serialized, freeToSale };
}

export function assertAnLocationsRemainSeparate(rows: PhysicalBatchSnapshot["rows"]): void {
  const byLoc = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.reviewState === "IGNORED") continue;
    const n = asMeta(row.normalized);
    const loc = String(n.location || "").toUpperCase();
    const sku = String(n.sku || "").toUpperCase();
    if (!loc || !sku) continue;
    const set = byLoc.get(loc) || new Set<string>();
    set.add(sku);
    byLoc.set(loc, set);
  }
  const pairs: Array<[string, string]> = [["AN102", "AN202"], ["AN103", "AN203"], ["AN104", "AN204"]];
  for (const [a, b] of pairs) {
    if (byLoc.has(a) && byLoc.has(b) && a === b) {
      throw new HttpError(409, `Las ubicaciones ${a} y ${b} no pueden fusionarse.`);
    }
  }
  const antenna = byLoc.get("AN102");
  const cable = byLoc.get("AN202");
  if (antenna && cable) {
    for (const sku of antenna) {
      if (cable.has(sku) && sku.startsWith("AND-VHLP")) {
        throw new HttpError(409, "AN102 y AN202 no deben compartir la antena.");
      }
    }
  }
}

async function loadPhysicalBatch(id: string): Promise<PhysicalBatchSnapshot> {
  const batch = await prisma.importBatch.findUnique({
    where: { id },
    include: {
      rows: {
        orderBy: { sourceRow: "asc" },
        select: {
          sourceRow: true,
          reviewState: true,
          normalized: true,
          errors: true,
          action: true
        }
      }
    }
  });
  if (!batch) throw new HttpError(404, "Importación no encontrada.");
  return batch;
}

async function liveInventoryQty(): Promise<Prisma.Decimal> {
  const agg = await prisma.inventory.aggregate({ _sum: { qty: true } });
  return agg._sum.qty ?? new Prisma.Decimal(0);
}

export async function preparePhysicalReconcileBatch(input: {
  batchId: string;
  userId: string;
  sourceSha256: string;
}) {
  const sha = assertSourceSha256(input.sourceSha256);
  const batch = await loadPhysicalBatch(input.batchId);
  if (batch.status === "COMPLETED") {
    throw new HttpError(409, "La importación ya fue confirmada y no puede prepararse.");
  }
  assertPhysicalBatchReady(batch);
  const meta = asMeta(batch.metadata);
  const stored = normalizeSha256(meta.sourceSha256);
  if (isSha256Hex(stored) && stored !== sha) {
    throw new HttpError(400, "SHA-256 incorrecto.");
  }
  const previousMode = inventoryModeOf(batch);
  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      metadata: {
        ...meta,
        inventoryMode: "RECONCILE",
        sourceSha256: sha,
        physicalPrepare: {
          at: new Date().toISOString(),
          administratorUserId: input.userId,
          previousMode,
          sourceSha256: sha
        }
      } as Prisma.InputJsonValue
    }
  });
  const revalidated = await revalidateImportBatch(batch.id);
  const blocked = revalidated.batch.rows.filter((row) => row.reviewState === "BLOCKED").length;
  if (revalidated.batch.invalidRows > 0 || blocked > 0) {
    throw new HttpError(409, "La revalidación RECONCILE dejó filas inválidas o bloqueadas.");
  }
  await logActivity({
    type: "INVENTORY",
    subtype: "PHYSICAL_PREPARE",
    reference: batch.id,
    userId: input.userId,
    result: "READY",
    metadata: {
      administratorUserId: input.userId,
      batchId: batch.id,
      originalFileName: batch.originalFileName,
      sourceSha256: sha,
      previousMode,
      inventoryMode: "RECONCILE",
      totalRows: revalidated.batch.totalRows,
      validRows: revalidated.batch.validRows
    }
  });
  return {
    ok: true as const,
    id: revalidated.batch.id,
    status: revalidated.batch.status,
    inventoryMode: "RECONCILE" as const,
    originalFileName: revalidated.batch.originalFileName,
    sourceSha256: sha,
    totalRows: revalidated.batch.totalRows,
    validRows: revalidated.batch.validRows,
    invalidRows: revalidated.batch.invalidRows,
    warningRows: revalidated.batch.warningRows,
    confirmedAt: revalidated.batch.confirmedAt,
    previousMode
  };
}

async function rebuildLegacyInventoryStock(tx: Prisma.TransactionClient): Promise<number> {
  const cubes = await tx.inventory.findMany({
    where: { qty: { gt: 0 } },
    select: { productId: true, qty: true, location: { select: { warehouse: true } } }
  });
  const grouped = new Map<string, { productId: string; warehouse: string; quantity: Prisma.Decimal }>();
  for (const cube of cubes) {
    const warehouse = cube.location.warehouse;
    const key = `${cube.productId}::${warehouse}`;
    const cur = grouped.get(key) || { productId: cube.productId, warehouse, quantity: new Prisma.Decimal(0) };
    cur.quantity = cur.quantity.add(cube.qty);
    grouped.set(key, cur);
  }
  const existing = grouped.size
    ? await tx.inventoryStock.findMany({
        where: {
          OR: [...grouped.values()].map((row) => ({ productId: row.productId, warehouse: row.warehouse }))
        },
        select: { id: true, productId: true, warehouse: true }
      })
    : [];
  const byKey = new Map(existing.map((row) => [`${row.productId}::${row.warehouse}`, row.id]));
  for (const row of grouped.values()) {
    const id = byKey.get(`${row.productId}::${row.warehouse}`);
    if (id) {
      await tx.inventoryStock.update({ where: { id }, data: { quantity: row.quantity } });
    } else {
      await tx.inventoryStock.create({
        data: { productId: row.productId, warehouse: row.warehouse, quantity: row.quantity }
      });
    }
  }
  return grouped.size;
}

export type PhysicalConfirmResult = {
  ok: true;
  alreadyApplied: boolean;
  batchId: string;
  status: "COMPLETED";
  originalFileName: string;
  sourceSha256: string;
  inventoryMode: "RECONCILE";
  before: { cubes: number; qty: string; movements: number; products: number; locations: number };
  after: { cubes: number; qty: string; movements: number; products: number; locations: number };
  applied: { rows: number; qty: string; cubes: number; layers: number; serials: number };
  zeroed: ReturnType<typeof Object>;
};

export async function executePhysicalInventoryConfirm(
  input: {
    batchId: string;
    userId: string;
    confirmation: unknown;
    sourceSha256: unknown;
  },
  db: PhysicalConfirmDb = prisma,
  deps: {
    loadBatch?: (id: string) => Promise<PhysicalBatchSnapshot>;
    liveQty?: () => Promise<Prisma.Decimal>;
    zero?: typeof zeroPhysicalInventoryState;
    applyRows?: typeof applyInventoryImportInTransaction;
    rebuildStock?: (tx: Prisma.TransactionClient) => Promise<number>;
    restoreReady?: (id: string, meta: Record<string, unknown>, error: unknown) => Promise<void>;
  } = {}
) {
  assertPhysicalConfirmPhrase(input.confirmation);
  const sha = assertSourceSha256(input.sourceSha256);
  const loadBatch = deps.loadBatch || loadPhysicalBatch;
  const existing = await loadBatch(input.batchId);
  const meta = asMeta(existing.metadata);
  if (existing.status === "COMPLETED") {
    assertPhysicalShaMatch(meta.sourceSha256, sha);
    return {
      ok: true as const,
      alreadyApplied: true,
      batchId: existing.id,
      status: "COMPLETED" as const,
      originalFileName: existing.originalFileName,
      sourceSha256: sha,
      inventoryMode: "RECONCILE" as const,
      before: meta.physicalConfirm?.before || null,
      after: meta.physicalConfirm?.after || null,
      applied: meta.physicalConfirm?.applied || null,
      zeroed: meta.physicalConfirm?.zeroed || null
    };
  }

  assertPhysicalBatchReady(existing);
  const mode = inventoryModeOf(existing);
  const liveQty = deps.liveQty ? await deps.liveQty() : await liveInventoryQty();
  assertPhysicalAppendBlocked(mode, liveQty);
  if (mode !== "RECONCILE") {
    throw new HttpError(
      409,
      "El lote físico debe estar en modo RECONCILE. Prepáralo con POST /api/v1/inventory/physical/prepare."
    );
  }
  assertPhysicalShaMatch(meta.sourceSha256, sha);
  assertAnLocationsRemainSeparate(existing.rows);
  const staged = stagedInventoryTotals(existing.rows);
  const zeroFn = deps.zero || zeroPhysicalInventoryState;
  const applyFn = deps.applyRows || applyInventoryImportInTransaction;
  const rebuildFn = deps.rebuildStock || rebuildLegacyInventoryStock;

  return withPhysicalInventoryLock("CONFIRM", () =>
    db.$transaction(async (tx) => {
      if (typeof tx.$queryRaw === "function") {
        await tx.$queryRaw`SELECT id FROM "Inventory" ORDER BY id FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM "ImportBatch" WHERE id = ${existing.id} FOR UPDATE`;
      }

      const claimed = await tx.importBatch.updateMany({
        where: { id: existing.id, status: "READY" },
        data: { status: "PROCESSING", confirmedAt: null, completedAt: null }
      });
      if (claimed.count !== 1) {
        const current = await tx.importBatch.findUnique({ where: { id: existing.id } });
        if (current?.status === "COMPLETED") {
          throw new HttpError(409, "La importación ya fue confirmada.");
        }
        throw new HttpError(409, "La importación ya está en proceso o no está lista para confirmar.");
      }

      const [cubesBefore, qtyBefore, movementsBefore, productsBefore, locationsBefore] = await Promise.all([
        tx.inventory.count(),
        tx.inventory.aggregate({ _sum: { qty: true } }),
        tx.inventoryMovement.count(),
        tx.product.count(),
        tx.location.count()
      ]);
      const before = {
        cubes: cubesBefore,
        qty: decimalText(qtyBefore._sum.qty),
        movements: movementsBefore,
        products: productsBefore,
        locations: locationsBefore
      };

      const zeroed = await zeroFn(tx);
      const execRows = existing.rows
        .filter((row) => row.reviewState !== "IGNORED")
        .map((row) => ({
          sourceRow: row.sourceRow,
          normalized: asMeta(row.normalized),
          errors: (row.errors as unknown[]) || [],
          action: row.action
        }));
      const applied = await applyFn(tx, {
        context: "INVENTORY",
        rows: execRows,
        userId: input.userId,
        batchId: existing.id,
        metadata: meta,
        finalizeBatch: false
      });
      await rebuildFn(tx);

      const [qtyAfterAgg, reservedAfter, serialsAfter, activeResAfter, cubesAfter, movementsAfter, productsAfter, locationsAfter] =
        await Promise.all([
          tx.inventory.aggregate({ _sum: { qty: true } }),
          tx.inventory.aggregate({ _sum: { reservedQty: true } }),
          tx.inventorySerial.count(),
          tx.inventoryReservation.count({ where: { status: "ACTIVE" } }),
          tx.inventory.count({ where: { qty: { gt: 0 } } }),
          tx.inventoryMovement.count(),
          tx.product.count(),
          tx.location.count()
        ]);
      const qtyAfter = qtyAfterAgg._sum.qty ?? new Prisma.Decimal(0);
      if (!qtyAfter.eq(staged.qty)) {
        throw new HttpError(
          500,
          `Los totales no coinciden con staging (${qtyAfter.toString()} vs ${staged.qty.toString()}). Se revirtió la operación.`
        );
      }
      if (serialsAfter !== applied.serials) {
        throw new HttpError(500, "Los seriales aplicados no coinciden. Se revirtió la operación.");
      }
      if (reservedAfter._sum.reservedQty && reservedAfter._sum.reservedQty.gt(0)) {
        throw new HttpError(500, "Quedaron reservas activas. Se revirtió la operación.");
      }
      if (activeResAfter !== 0) {
        throw new HttpError(500, "Quedaron reservas ACTIVE. Se revirtió la operación.");
      }

      const after = {
        cubes: cubesAfter,
        qty: qtyAfter.toString(),
        movements: movementsAfter,
        products: productsAfter,
        locations: locationsAfter
      };
      const now = new Date();
      const cleanMeta = { ...meta };
      delete cleanMeta.lastFailedAttempt;
      await tx.importBatch.update({
        where: { id: existing.id },
        data: {
          status: "COMPLETED",
          confirmedAt: now,
          completedAt: now,
          metadata: {
            ...cleanMeta,
            inventoryMode: "RECONCILE",
            sourceSha256: sha,
            physicalConfirm: {
              at: now.toISOString(),
              administratorUserId: input.userId,
              batchId: existing.id,
              sourceSha256: sha,
              originalFileName: existing.originalFileName,
              alreadyApplied: false,
              before,
              after,
              applied: {
                rows: execRows.length,
                qty: applied.stagedQty,
                cubes: applied.cubes,
                layers: applied.layers,
                serials: applied.serials
              },
              zeroed
            }
          } as Prisma.InputJsonValue
        }
      });
      await logActivity(
        {
          type: "INVENTORY",
          subtype: "PHYSICAL_CONFIRM",
          reference: existing.id,
          userId: input.userId,
          qty: after.qty,
          result: "COMPLETED",
          metadata: {
            administratorUserId: input.userId,
            batchId: existing.id,
            originalFileName: existing.originalFileName,
            sourceSha256: sha,
            before,
            after,
            applied: {
              rows: execRows.length,
              qty: applied.stagedQty,
              cubes: applied.cubes,
              serials: applied.serials
            }
          }
        },
        tx
      );
      return {
        ok: true as const,
        alreadyApplied: false,
        batchId: existing.id,
        status: "COMPLETED" as const,
        originalFileName: existing.originalFileName,
        sourceSha256: sha,
        inventoryMode: "RECONCILE" as const,
        before,
        after,
        applied: {
          rows: execRows.length,
          qty: applied.stagedQty,
          cubes: applied.cubes,
          layers: applied.layers,
          serials: applied.serials
        },
        zeroed
      };
    }, inventoryImportTransactionOptions(existing.rows.length + 200))
  ).catch(async (error) => {
    if (deps.restoreReady) {
      await deps.restoreReady(existing.id, meta, error);
    } else {
      await prisma.importBatch.updateMany({
        where: { id: existing.id, status: "PROCESSING" },
        data: {
          status: "READY",
          confirmedAt: null,
          completedAt: null,
          metadata: {
            ...meta,
            lastFailedAttempt: {
              at: new Date().toISOString(),
              error: error instanceof Error ? error.message : "PHYSICAL_CONFIRM_FAILED"
            }
          } as Prisma.InputJsonValue
        }
      });
    }
    if (error instanceof HttpError || error instanceof ImportExecuteError) {
      throw error instanceof HttpError
        ? error
        : new HttpError(409, `No se pudo sustituir el inventario. ${error.message}`);
    }
    throw error;
  });
}
