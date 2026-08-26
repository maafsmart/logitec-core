import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import {
  buildAssignment,
  inboundAssignmentFields,
  type InventoryAssignment
} from "../inventory/inventory-assignment.js";
import { toDecimal } from "./import-validate.service.js";
import type { ImportContext } from "./import-mapping.js";

function inventoryCubeKey(
  productId: string,
  locationId: string,
  status: string,
  assignmentKey: string
): string {
  return `${productId}|${locationId}|${status}|${assignmentKey}`;
}

type ExecRow = {
  sourceRow: number;
  normalized: Record<string, unknown>;
  errors: unknown[];
  action?: string | null;
};

export class ImportExecuteError extends Error {
  readonly sourceRow: number | null;

  constructor(message: string, sourceRow?: number | null) {
    super(message);
    this.name = "ImportExecuteError";
    this.sourceRow = sourceRow ?? null;
  }
}

const PG_PARAM_BUDGET = 24_000;

function bulkChunkSize(columnCount: number): number {
  return Math.max(25, Math.min(400, Math.floor(PG_PARAM_BUDGET / Math.max(columnCount, 1))));
}

function chunkRows<T>(rows: T[], columnCount: number): T[][] {
  const size = bulkChunkSize(columnCount);
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size));
  return chunks;
}

async function createManyChunked<T>(
  columnCount: number,
  rows: T[],
  insert: (part: T[]) => Promise<unknown>
): Promise<void> {
  if (!rows.length) return;
  for (const part of chunkRows(rows, columnCount)) {
    await insert(part);
  }
}

function asMetaRecord(value: Record<string, unknown> | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
}

function uniqueConflict(error: unknown, message: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
    throw new ImportExecuteError(`${message}: conflicto de unicidad, abortando para reintentar.`);
  }
  throw error;
}

type PreparedRow = {
  sourceRow: number;
  sku: string;
  productId: string;
  locationId: string;
  status: string;
  qty: Prisma.Decimal;
  assignment: InventoryAssignment;
  lotNumber: string | null;
  unitPriceMxn: Prisma.Decimal | null;
  unitPriceUsd: Prisma.Decimal | null;
  reference: string | null;
  notes: string | null;
  serialNumber: string | null;
  imei: string | null;
  name: string;
  barcode: string | null;
  warehouse: string;
  serialControlled: boolean;
  lotControlled: boolean;
};

export async function executeInventoryImportBulk(input: {
  context: ImportContext;
  rows: ExecRow[];
  userId: string;
  batchId: string;
  metadata?: Record<string, unknown>;
  txOptions: { maxWait: number; timeout: number };
}) {
  const valid = [...input.rows]
    .filter((r) => !Array.isArray(r.errors) || r.errors.length === 0)
    .sort((a, b) => a.sourceRow - b.sourceRow);
  const sourceMeta = asMetaRecord(input.metadata);

  return prisma.$transaction(async (tx) => {
      const prepared: PreparedRow[] = [];
      for (const row of valid) {
        prepared.push(prepareRow(row, input.context));
      }

      const skuKeys = [...new Set(prepared.map((r) => r.sku))];
      const locationIds = [...new Set(prepared.map((r) => r.locationId))];
      const projectIds = [
        ...new Set(prepared.map((r) => r.assignment.projectId).filter((id): id is string => Boolean(id)))
      ];

      const products = skuKeys.length
        ? await tx.product.findMany({
            where: { OR: skuKeys.map((sku) => ({ sku: { equals: sku, mode: "insensitive" as const } })) },
            select: { id: true, sku: true, customerId: true }
          })
        : [];
      const productBySku = new Map<string, { id: string; sku: string; customerId: string | null }>();
      for (const product of products) {
        productBySku.set(product.sku.trim().toUpperCase(), {
          id: product.id,
          sku: product.sku,
          customerId: product.customerId
        });
      }

      const locations = locationIds.length
        ? await tx.location.findMany({
            where: { id: { in: locationIds } },
            select: { id: true, code: true, warehouse: true }
          })
        : [];
      const locationById = new Map(locations.map((l) => [l.id, l]));
      for (const row of prepared) {
        if (!locationById.has(row.locationId)) {
          throw new ImportExecuteError("LOCATION_REQUIRED", row.sourceRow);
        }
      }

      if (projectIds.length) {
        const projects = await tx.customer.findMany({
          where: { id: { in: projectIds } },
          select: { id: true }
        });
        const projectSet = new Set(projects.map((p) => p.id));
        for (const row of prepared) {
          if (row.assignment.assignmentType === "PROJECT" && row.assignment.projectId && !projectSet.has(row.assignment.projectId)) {
            throw new ImportExecuteError("PROJECT_NOT_FOUND", row.sourceRow);
          }
        }
      }

      const newProducts: Prisma.ProductCreateManyInput[] = [];
      const newProductIds: string[] = [];
      for (const sku of skuKeys) {
        if (productBySku.has(sku)) continue;
        const sample = prepared.find((r) => r.sku === sku)!;
        const id = randomUUID();
        const customerId =
          sample.assignment.assignmentType === "PROJECT" ? sample.assignment.projectId : null;
        newProducts.push({
          id,
          sku,
          name: sample.name,
          barcode: sample.barcode,
          warehouse: sample.warehouse,
          customerId,
          serialControlled: sample.serialControlled,
          lotControlled: sample.lotControlled
        });
        newProductIds.push(id);
        productBySku.set(sku, { id, sku, customerId });
      }
      for (const row of prepared) {
        const product = productBySku.get(row.sku);
        if (!product) throw new ImportExecuteError("SKU_REQUIRED", row.sourceRow);
        row.productId = product.id;
      }

      const existingProductIds = [...new Set(prepared.map((r) => r.productId))];
      const existingLinks = existingProductIds.length
        ? await tx.productProject.findMany({
            where: { productId: { in: existingProductIds.filter((id) => !newProductIds.includes(id)) } },
            select: { productId: true, projectId: true }
          })
        : [];
      const linkSet = new Set(existingLinks.map((l) => `${l.productId}::${l.projectId}`));
      const newLinks: Prisma.ProductProjectCreateManyInput[] = [];
      for (const row of prepared) {
        if (row.assignment.assignmentType !== "PROJECT" || !row.assignment.projectId) continue;
        const key = `${row.productId}::${row.assignment.projectId}`;
        if (linkSet.has(key)) continue;
        newLinks.push({
          id: randomUUID(),
          productId: row.productId,
          projectId: row.assignment.projectId,
          active: true
        });
        linkSet.add(key);
      }

      const preloadProductIds = existingProductIds.filter((id) => !newProductIds.includes(id));
      const existingInventories = preloadProductIds.length
        ? await tx.inventory.findMany({
            where: { productId: { in: preloadProductIds } },
            select: {
              id: true,
              productId: true,
              locationId: true,
              status: true,
              assignmentKey: true,
              qty: true
            }
          })
        : [];
      const existingByCube = new Map<
        string,
        { id: string; qty: Prisma.Decimal }
      >();
      for (const inv of existingInventories) {
        existingByCube.set(
          inventoryCubeKey(inv.productId, inv.locationId, inv.status, inv.assignmentKey),
          { id: inv.id, qty: inv.qty }
        );
      }

      const neededCubes = new Map<
        string,
        { productId: string; locationId: string; status: string; assignment: InventoryAssignment }
      >();
      for (const row of prepared) {
        const key = inventoryCubeKey(row.productId, row.locationId, row.status, row.assignment.assignmentKey);
        if (!neededCubes.has(key)) {
          neededCubes.set(key, {
            productId: row.productId,
            locationId: row.locationId,
            status: row.status,
            assignment: row.assignment
          });
        }
      }

      const inventoryByCube = new Map<string, { id: string; qty: Prisma.Decimal; existing: boolean }>();
      const existingIds = [...neededCubes.keys()]
        .map((key) => existingByCube.get(key)?.id)
        .filter((id): id is string => Boolean(id))
        .sort();
      if (existingIds.length) {
        const locked = await tx.$queryRaw<Array<{ id: string; qty: Prisma.Decimal }>>`
          SELECT id, qty
          FROM "Inventory"
          WHERE id IN (${Prisma.join(existingIds)})
          ORDER BY id
          FOR UPDATE
        `;
        const lockedById = new Map(locked.map((row) => [row.id, row.qty]));
        for (const [key, found] of existingByCube) {
          if (!neededCubes.has(key)) continue;
          const qty = lockedById.get(found.id);
          if (qty == null) throw new ImportExecuteError("INVENTORY_NOT_FOUND");
          inventoryByCube.set(key, { id: found.id, qty, existing: true });
        }
      }

      const newInventories: Prisma.InventoryCreateManyInput[] = [];
      for (const [key, cube] of neededCubes) {
        const found = inventoryByCube.get(key);
        if (found) continue;
        const id = randomUUID();
        newInventories.push({
          id,
          productId: cube.productId,
          locationId: cube.locationId,
          status: cube.status,
          qty: new Prisma.Decimal(0),
          reservedQty: new Prisma.Decimal(0),
          assignmentType: cube.assignment.assignmentType,
          projectId: cube.assignment.projectId,
          assignmentKey: cube.assignment.assignmentKey
        });
        inventoryByCube.set(key, { id, qty: new Prisma.Decimal(0), existing: false });
      }

      const runningQty = new Map<string, Prisma.Decimal>();
      for (const [key, cube] of inventoryByCube) {
        runningQty.set(key, cube.qty);
      }

      const receivedAt = new Date();
      const layers: Prisma.InventoryLayerCreateManyInput[] = [];
      const movements: Prisma.InventoryMovementCreateManyInput[] = [];
      const serials: Prisma.InventorySerialCreateManyInput[] = [];
      const activities: Prisma.ActivityLogUncheckedCreateInput[] = [];
      const txResults: Array<{ sourceRow: number; ok: boolean; message?: string; productId?: string }> = [];

      for (const row of prepared) {
        const cubeKey = inventoryCubeKey(row.productId, row.locationId, row.status, row.assignment.assignmentKey);
        const cube = inventoryByCube.get(cubeKey);
        if (!cube) throw new ImportExecuteError("INVENTORY_NOT_FOUND", row.sourceRow);
        const before = runningQty.get(cubeKey) ?? new Prisma.Decimal(0);
        const after = before.add(row.qty);
        runningQty.set(cubeKey, after);
        const location = locationById.get(row.locationId)!;
        const product = productBySku.get(row.sku)!;
        const layerId = randomUUID();
        const movementId = randomUUID();
        layers.push({
          id: layerId,
          inventoryId: cube.id,
          qty: row.qty,
          reservedQty: new Prisma.Decimal(0),
          lotNumber: row.lotNumber,
          receivedAt,
          unitPriceMxn: row.unitPriceMxn,
          unitPriceUsd: row.unitPriceUsd,
          sourceReference: row.reference,
          sourceType: "MANUAL_IN"
        });
        movements.push({
          id: movementId,
          productId: row.productId,
          type: "INBOUND",
          movementType: "IN",
          stockStatus: row.status,
          qty: row.qty,
          warehouse: location.warehouse,
          toLocationId: row.locationId,
          inventoryLayerId: layerId,
          quantityBefore: before,
          quantityAfter: after,
          reference: row.reference,
          notes: row.notes,
          userId: input.userId,
          ...inboundAssignmentFields(row.assignment)
        });
        if (row.serialNumber) {
          const serialId = randomUUID();
          serials.push({
            id: serialId,
            productId: row.productId,
            inventoryLayerId: layerId,
            serialNumber: row.serialNumber,
            imei: row.imei,
            receivedAt
          });
        }
        activities.push({
          type: "IMPORT",
          subtype: input.context,
          reference: row.sku,
          userId: input.userId,
          productId: row.productId,
          customerId: product.customerId,
          warehouse: location.warehouse,
          location: location.code,
          qty: row.qty,
          result: "OK",
          metadata: {
            inventoryId: cube.id,
            layerId,
            movementId
          }
        });
        txResults.push({ sourceRow: row.sourceRow, ok: true, productId: row.productId });
      }

      const existingQtyUpdates: Array<{ id: string; qty: Prisma.Decimal }> = [];
      for (const [key, cube] of inventoryByCube) {
        const finalQty = runningQty.get(key) ?? cube.qty;
        if (cube.existing) {
          existingQtyUpdates.push({ id: cube.id, qty: finalQty });
        } else {
          const created = newInventories.find((item) => item.id === cube.id);
          if (created) created.qty = finalQty;
        }
      }

      try {
        await createManyChunked(9, newProducts, (data) => tx.product.createMany({ data }));
        await createManyChunked(4, newLinks, (data) => tx.productProject.createMany({ data, skipDuplicates: true }));
        await createManyChunked(9, newInventories, (data) => tx.inventory.createMany({ data }));
      } catch (error) {
        uniqueConflict(error, "IMPORT_UNIQUE_CONFLICT");
      }

      if (existingQtyUpdates.length) {
        await updateExistingInventoryQty(tx, existingQtyUpdates);
      }

      try {
        await createManyChunked(10, layers, (data) => tx.inventoryLayer.createMany({ data }));
        await createManyChunked(18, movements, (data) => tx.inventoryMovement.createMany({ data }));
        await createManyChunked(6, serials, (data) => tx.inventorySerial.createMany({ data }));
        await createManyChunked(13, activities, (data) => tx.activityLog.createMany({ data }));
      } catch (error) {
        uniqueConflict(error, "IMPORT_UNIQUE_CONFLICT");
      }

      const qtyTotal = [...runningQty.values()].reduce((sum, qty) => sum.add(qty), new Prisma.Decimal(0));
      const cleanMeta = { ...sourceMeta };
      delete cleanMeta.lastFailedAttempt;
      await tx.importBatch.update({
        where: { id: input.batchId },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          metadata: {
            ...cleanMeta,
            execution: {
              results: txResults,
              failed: 0,
              bulk: {
                cubes: neededCubes.size,
                layers: layers.length,
                movements: movements.length,
                serials: serials.length,
                newProducts: newProducts.length,
                qtyTotal: qtyTotal.toString()
              }
            }
          } as Prisma.InputJsonValue
        }
      });
      return txResults;
  }, input.txOptions);
}

function prepareRow(row: ExecRow, context: ImportContext): PreparedRow {
  const n = row.normalized;
  const sku = String(n.sku || "").trim().toUpperCase();
  if (!sku) throw new ImportExecuteError("SKU_REQUIRED", row.sourceRow);
  const assignmentType = String(n.assignmentType || "");
  if (assignmentType === "UNRESOLVED") throw new ImportExecuteError("ASSIGNMENT_UNRESOLVED", row.sourceRow);
  if (assignmentType !== "PROJECT" && assignmentType !== "FREE_TO_SALE") {
    throw new ImportExecuteError("ASSIGNMENT_REQUIRED", row.sourceRow);
  }
  const projectId = assignmentType === "PROJECT" ? String(n.projectId || "") : null;
  if (assignmentType === "PROJECT" && !projectId) {
    throw new ImportExecuteError("PROJECT_REQUIRED", row.sourceRow);
  }
  let assignment: InventoryAssignment;
  try {
    assignment = buildAssignment(assignmentType, projectId);
  } catch (error) {
    throw new ImportExecuteError(error instanceof Error ? error.message : "ASSIGNMENT_REQUIRED", row.sourceRow);
  }
  const locationId = String(n.locationId || "");
  if (!locationId) throw new ImportExecuteError("LOCATION_REQUIRED", row.sourceRow);
  const status = String(n.status || "");
  if (!status) throw new ImportExecuteError("STATUS_REQUIRED", row.sourceRow);
  const qty = toDecimal(n.qty) || new Prisma.Decimal(0);
  return {
    sourceRow: row.sourceRow,
    sku,
    productId: "",
    locationId,
    status,
    qty,
    assignment,
    lotNumber: n.lotNumber ? String(n.lotNumber) : null,
    unitPriceMxn: toDecimal(n.unitPriceMxn),
    unitPriceUsd: toDecimal(n.unitPriceUsd),
    reference: n.reference ? String(n.reference) : `IMPORT-${context}`,
    notes: n.notes ? String(n.notes) : null,
    serialNumber: n.serialNumber ? String(n.serialNumber) : null,
    imei: n.imei ? String(n.imei) : null,
    name: String(n.name || sku),
    barcode: n.barcode ? String(n.barcode) : null,
    warehouse: String(n.warehouse || "TULTITLAN24"),
    serialControlled: Boolean(n.serialControlled),
    lotControlled: Boolean(n.lotControlled)
  };
}

export function prepareInventoryImportRow(
  row: { sourceRow: number; normalized: Record<string, unknown>; errors: unknown[]; action?: string | null },
  context: ImportContext = "INVENTORY"
) {
  return prepareRow(row, context);
}

async function updateExistingInventoryQty(
  tx: Prisma.TransactionClient,
  updates: Array<{ id: string; qty: Prisma.Decimal }>
) {
  const values = updates.map((row) => Prisma.sql`(${row.id}, ${row.qty})`);
  await tx.$executeRaw`
    UPDATE "Inventory" AS i
    SET qty = v.qty, "updatedAt" = NOW()
    FROM (VALUES ${Prisma.join(values)}) AS v(id, qty)
    WHERE i.id = v.id
  `;
}
