import { Prisma, type InventoryAssignmentType } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import type { UserRole } from "../../middlewares/auth.middleware.js";
import { clientInventoryWhere } from "../clients/client-scope.js";
import { normalizeInventoryStatusCode } from "./inventory-status.js";

type AuthContext = {
  role: UserRole;
  clientId: string | null;
};

export type RelocateBalanceSearchQuery = {
  warehouse: string;
  locationCode: string;
  status: string;
  q?: string;
  take?: number;
};

export type RelocateBalanceSuggestion = {
  inventoryId: string;
  layerId: string;
  productId: string;
  sku: string;
  barcode: string | null;
  productName: string;
  assignmentType: InventoryAssignmentType;
  assignmentLabel: string;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  warehouse: string;
  locationCode: string;
  status: string;
  qty: string;
  reservedQty: string;
  availableQty: string;
  lotNumber: string | null;
  layerCount: number;
  serialCount: number;
  layers: Array<{
    id: string;
    lotNumber: string | null;
    qty: string;
    reservedQty: string;
    availableQty: string;
    receivedAt: string | null;
  }>;
};

type RelocateLayerRow = {
  id: string;
  lotNumber: string | null;
  qty: Prisma.Decimal;
  reservedQty: Prisma.Decimal;
  serialCount: number;
  receivedAt?: Date | null;
};

type RelocateInventoryRow = {
  id: string;
  qty: Prisma.Decimal;
  reservedQty: Prisma.Decimal;
  status: string;
  assignmentType: InventoryAssignmentType;
  projectId: string | null;
  product: {
    id: string;
    sku: string;
    barcode: string | null;
    name: string;
  };
  location: {
    warehouse: string;
    code: string;
  };
  project: { id: string; code: string; name: string } | null;
  layers: RelocateLayerRow[];
};

function dec(value: Prisma.Decimal | string | number | null | undefined) {
  return new Prisma.Decimal(value == null ? 0 : String(value));
}

function unreserved(qty: Prisma.Decimal, reservedQty: Prisma.Decimal) {
  const available = qty.minus(reservedQty);
  return available.lessThan(0) ? new Prisma.Decimal(0) : available;
}

function assignmentLabel(row: {
  assignmentType: InventoryAssignmentType;
  project: { code: string; name: string } | null;
}) {
  if (row.assignmentType === "FREE_TO_SALE") return "Free to Sale";
  if (row.assignmentType === "PROJECT") {
    if (row.project?.name) {
      return row.project.code ? `${row.project.name} (${row.project.code})` : row.project.name;
    }
    return "Proyecto";
  }
  return "Sin asignar";
}

export function canonicalRelocateStatus(raw: string): string {
  const normalized = normalizeInventoryStatusCode(raw);
  if (!normalized) return "";
  if (normalized === "DISPONIBLE") return "AVAILABLE";
  return normalized;
}

export function relocateWarehouseMatches(
  locationWarehouse: string | null | undefined,
  requested: string
): boolean {
  return String(locationWarehouse || "").trim().toUpperCase() === requested.trim().toUpperCase();
}

export function relocateLocationCodeMatches(
  locationCode: string | null | undefined,
  requested: string
): boolean {
  return String(locationCode || "").trim().toUpperCase() === requested.trim().toUpperCase();
}

function stripRelocateSearchNoise(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function matchesRelocateProductQuery(
  product: { sku?: string | null; barcode?: string | null; name?: string | null },
  q: string
): boolean {
  const query = String(q || "").trim();
  if (!query) return true;
  const needle = query.toUpperCase();
  const strippedNeedle = stripRelocateSearchNoise(query);
  return [product.sku, product.barcode, product.name].some((field) => {
    const hay = String(field || "").toUpperCase();
    if (!hay) return false;
    if (hay.includes(needle)) return true;
    if (strippedNeedle.length >= 2 && stripRelocateSearchNoise(hay).includes(strippedNeedle)) return true;
    return false;
  });
}

export function toRelocateBalanceSuggestions(rows: RelocateInventoryRow[]): RelocateBalanceSuggestion[] {
  const suggestions: RelocateBalanceSuggestion[] = [];
  for (const row of rows) {
    const physical = dec(row.qty);
    if (physical.lessThanOrEqualTo(0)) continue;
    const inventoryAvailable = unreserved(physical, dec(row.reservedQty));
    if (inventoryAvailable.lessThanOrEqualTo(0)) continue;

    const positiveLayers = (row.layers || []).filter((layer) => dec(layer.qty).greaterThan(0) && layer.id);
    const layerCount = positiveLayers.length || 1;
    const serialCount = positiveLayers.reduce((sum, layer) => sum + Number(layer.serialCount || 0), 0);
    const layerDetails = positiveLayers.map((layer) => {
      const layerAvailable = unreserved(dec(layer.qty), dec(layer.reservedQty));
      return {
        id: layer.id,
        lotNumber: layer.lotNumber ?? null,
        qty: dec(layer.qty).toString(),
        reservedQty: dec(layer.reservedQty).toString(),
        availableQty: layerAvailable.toString(),
        receivedAt: layer.receivedAt ? layer.receivedAt.toISOString() : null
      };
    });

    suggestions.push({
      inventoryId: row.id,
      layerId: "",
      productId: row.product.id,
      sku: row.product.sku,
      barcode: row.product.barcode,
      productName: row.product.name,
      assignmentType: row.assignmentType,
      assignmentLabel: assignmentLabel(row),
      projectId: row.projectId,
      projectCode: row.project?.code ?? null,
      projectName: row.project?.name ?? null,
      warehouse: row.location.warehouse,
      locationCode: row.location.code,
      status: row.status,
      qty: physical.toString(),
      reservedQty: dec(row.reservedQty).toString(),
      availableQty: inventoryAvailable.toString(),
      lotNumber: layerCount === 1 ? positiveLayers[0]?.lotNumber ?? null : null,
      layerCount,
      serialCount,
      layers: layerDetails
    });
  }
  return suggestions;
}

export function filterRelocateInventories(
  rows: RelocateInventoryRow[],
  query: RelocateBalanceSearchQuery
): RelocateBalanceSuggestion[] {
  const status = canonicalRelocateStatus(query.status);
  return toRelocateBalanceSuggestions(
    rows.filter(
      (row) =>
        relocateWarehouseMatches(row.location.warehouse, query.warehouse) &&
        relocateLocationCodeMatches(row.location.code, query.locationCode) &&
        canonicalRelocateStatus(row.status) === status &&
        matchesRelocateProductQuery(row.product, query.q || "")
    )
  );
}

export async function searchRelocateBalances(
  query: RelocateBalanceSearchQuery,
  auth: AuthContext
): Promise<RelocateBalanceSuggestion[]> {
  const warehouse = query.warehouse.trim();
  const locationCode = query.locationCode.trim();
  const status = canonicalRelocateStatus(query.status);
  const q = (query.q || "").trim();
  const take = Math.min(Math.max(query.take ?? 40, 1), 80);
  if (!warehouse || !locationCode || !status) return [];

  const location = await prisma.location.findFirst({
    where: { code: { equals: locationCode, mode: "insensitive" } }
  });
  if (!location || !relocateWarehouseMatches(location.warehouse, warehouse)) return [];

  const rows = await prisma.inventory.findMany({
    where: {
      AND: [clientInventoryWhere(auth), { locationId: location.id, qty: { gt: 0 } }]
    },
    orderBy: [{ product: { sku: "asc" } }, { assignmentKey: "asc" }, { id: "asc" }],
    include: {
      product: { select: { id: true, sku: true, barcode: true, name: true } },
      location: { select: { warehouse: true, code: true } },
      project: { select: { id: true, code: true, name: true } },
      layers: {
        where: { qty: { gt: 0 } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          lotNumber: true,
          qty: true,
          reservedQty: true,
          receivedAt: true,
          _count: { select: { serials: true } }
        }
      }
    }
  });

  const matched = rows.filter(
    (row) =>
      canonicalRelocateStatus(row.status) === status && matchesRelocateProductQuery(row.product, q)
  );

  return toRelocateBalanceSuggestions(
    matched.slice(0, take).map((row) => ({
      id: row.id,
      qty: row.qty,
      reservedQty: row.reservedQty,
      status: row.status,
      assignmentType: row.assignmentType,
      projectId: row.projectId,
      product: row.product,
      location: row.location,
      project: row.project,
      layers: row.layers.map((layer) => ({
        id: layer.id,
          lotNumber: layer.lotNumber,
          qty: layer.qty,
          reservedQty: layer.reservedQty,
          serialCount: layer._count.serials,
          receivedAt: layer.receivedAt
      }))
    }))
  );
}
