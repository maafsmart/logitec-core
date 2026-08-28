import { Prisma, type InventoryAssignmentType } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import type { UserRole } from "../../middlewares/auth.middleware.js";
import { clientInventoryWhere } from "../clients/client-scope.js";

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
};

type RelocateLayerRow = {
  id: string;
  lotNumber: string | null;
  qty: Prisma.Decimal;
  reservedQty: Prisma.Decimal;
  serialCount: number;
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

export function toRelocateBalanceSuggestions(rows: RelocateInventoryRow[]): RelocateBalanceSuggestion[] {
  const suggestions: RelocateBalanceSuggestion[] = [];
  for (const row of rows) {
    const physical = dec(row.qty);
    if (physical.lessThanOrEqualTo(0)) continue;
    const inventoryAvailable = unreserved(physical, dec(row.reservedQty));
    if (inventoryAvailable.lessThanOrEqualTo(0)) continue;

    const positiveLayers = (row.layers || []).filter((layer) => dec(layer.qty).greaterThan(0));
    const layerCount = positiveLayers.length || 1;
    const layers = positiveLayers.length
      ? positiveLayers
      : [
          {
            id: "",
            lotNumber: null,
            qty: physical,
            reservedQty: dec(row.reservedQty),
            serialCount: 0
          }
        ];

    for (const layer of layers) {
      if (!layer.id) continue;
      const layerAvailable = unreserved(dec(layer.qty), dec(layer.reservedQty));
      const available = layerAvailable.lessThan(inventoryAvailable) ? layerAvailable : inventoryAvailable;
      if (available.lessThanOrEqualTo(0)) continue;
      suggestions.push({
        inventoryId: row.id,
        layerId: layer.id,
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
        availableQty: available.toString(),
        lotNumber: layer.lotNumber ?? null,
        layerCount,
        serialCount: Number(layer.serialCount || 0)
      });
    }
  }
  return suggestions;
}

export async function searchRelocateBalances(
  query: RelocateBalanceSearchQuery,
  auth: AuthContext
): Promise<RelocateBalanceSuggestion[]> {
  const warehouse = query.warehouse.trim().toUpperCase();
  const locationCode = query.locationCode.trim().toUpperCase();
  const status = query.status.trim();
  const q = (query.q || "").trim();
  const take = Math.min(Math.max(query.take ?? 40, 1), 80);

  const location = await prisma.location.findFirst({
    where: { code: locationCode, warehouse, active: true }
  });
  if (!location) return [];

  const productFilter: Prisma.ProductWhereInput | undefined = q
    ? {
        OR: [
          { sku: { contains: q, mode: "insensitive" } },
          { barcode: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } }
        ]
      }
    : undefined;

  const rows = await prisma.inventory.findMany({
    where: {
      AND: [
        clientInventoryWhere(auth),
        { locationId: location.id, status, qty: { gt: 0 } },
        productFilter ? { product: productFilter } : {}
      ]
    },
    orderBy: [{ product: { sku: "asc" } }, { assignmentKey: "asc" }, { id: "asc" }],
    take,
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
          _count: { select: { serials: true } }
        }
      }
    }
  });

  return toRelocateBalanceSuggestions(
    rows.map((row) => ({
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
        serialCount: layer._count.serials
      }))
    }))
  );
}
