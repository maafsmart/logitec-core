import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../shared/http-error.js";
import { clientProductWhere, clientSerialWhere, operationalClientId, scopedInventoryWhere } from "../clients/client-scope.js";
import type { UserRole } from "../../middlewares/auth.middleware.js";
import { calculateInventoryValuation, summarizeStockAssignments } from "../inventory/inventory-valuation.service.js";
import { canExposeEconomicValuation } from "../inventory/inventory-economic-access.js";
import { isForbiddenInventoryProjectRecord } from "../inventory/inventory-project-rules.js";

type AuthContext = {
  role: UserRole;
  clientId: string | null;
  operationalClientId?: string | null;
};

const productInclude = {
  customer: {
    include: {
      client: {
        select: { id: true, name: true, legalName: true, tradeName: true, active: true }
      }
    }
  },
  productProjects: {
    where: { active: true },
    select: {
      projectId: true,
      project: { select: { id: true, code: true, name: true, clientId: true } }
    }
  }
} as const;

function normalized(value: string | null | undefined): string {
  return (value || "").trim().toLocaleLowerCase();
}

function mapSkuClient(
  client: { id: string; name: string; legalName: string | null; tradeName: string | null } | null | undefined
) {
  if (!client) return null;
  if (isForbiddenInventoryProjectRecord({ code: client.name, name: client.tradeName || client.legalName || client.name })) {
    return null;
  }
  return {
    id: client.id,
    name: client.name,
    tradeName: client.tradeName,
    legalName: client.legalName
  };
}

function qtyTriplet(qty: Prisma.Decimal, reservedQty: Prisma.Decimal) {
  return {
    qty: qty.toString(),
    reservedQty: reservedQty.toString(),
    unreservedQty: qty.minus(reservedQty).toString()
  };
}

function matchScore(product: {
  sku: string;
  barcode: string | null;
  name: string;
  description: string | null;
}, query: string): number {
  const exact = [product.sku, product.barcode].some((value) => normalized(value) === query);
  if (exact) return 1000;
  const starts = [product.sku, product.barcode].some((value) => normalized(value).startsWith(query));
  if (starts) return 800;
  if (normalized(product.name).startsWith(query)) return 600;
  return 100;
}

type SkuSearchOpts = {
  location?: string;
  warehouse?: string;
  requireStock?: boolean;
};

export async function searchSkuProducts(
  query: string,
  auth: AuthContext,
  take = 30,
  opts: SkuSearchOpts = {}
) {
  operationalClientId(auth);
  const q = query.trim();
  if (!q) return [];
  const locationFilter = opts.location?.trim() || "";
  const warehouseFilter = opts.warehouse?.trim() || "";
  const where: Prisma.ProductWhereInput = {
    AND: [
      clientProductWhere(auth),
      {
        OR: [
          { sku: { contains: q, mode: "insensitive" } },
          { barcode: { contains: q, mode: "insensitive" } },
          { name: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          {
            productProjects: {
              some: {
                active: true,
                project: {
                  clientId: auth.operationalClientId || auth.clientId || undefined,
                  OR: [
                    { code: { contains: q, mode: "insensitive" } },
                    { name: { contains: q, mode: "insensitive" } }
                  ]
                }
              }
            }
          }
        ]
      }
    ]
  };
  const rows = await prisma.product.findMany({
    where,
    include: productInclude,
    take: Math.max(take * 3, 90)
  });
  const normalizedQuery = normalized(q);
  const sliced = rows
    .sort((a, b) => {
      const score = matchScore(b, normalizedQuery) - matchScore(a, normalizedQuery);
      return score || a.sku.localeCompare(b.sku, "es");
    })
    .slice(0, take);
  const productIds = sliced.map((product) => product.id);
  const inventoryWhere: Prisma.InventoryWhereInput[] = [
    scopedInventoryWhere(auth),
    { productId: { in: productIds } }
  ];
  if (locationFilter) {
    inventoryWhere.push({
      location: { code: { contains: locationFilter, mode: "insensitive" } }
    });
  }
  if (warehouseFilter) {
    inventoryWhere.push({
      location: { warehouse: { equals: warehouseFilter, mode: "insensitive" } }
    });
  }
  const inventories = productIds.length
    ? await prisma.inventory.findMany({
        where: { AND: inventoryWhere },
        select: {
          productId: true,
          qty: true,
          reservedQty: true,
          assignmentType: true,
          location: { select: { code: true, warehouse: true } },
          project: { select: { code: true, name: true } }
        }
      })
    : [];
  const stockByProduct = new Map<
    string,
    {
      available: Prisma.Decimal;
      locationCode: string;
      warehouse: string;
      projectCode: string;
      projectName: string;
    }
  >();
  for (const row of inventories) {
    const available = row.qty.minus(row.reservedQty);
    if (available.lte(0)) continue;
    const projectCode =
      row.assignmentType === "FREE_TO_SALE" ? "FREE TO SALE" : row.project?.code || "";
    const projectName =
      row.assignmentType === "FREE_TO_SALE" ? "Free to Sale" : row.project?.name || "";
    const current = stockByProduct.get(row.productId);
    if (!current || available.gt(current.available)) {
      stockByProduct.set(row.productId, {
        available,
        locationCode: row.location.code,
        warehouse: row.location.warehouse,
        projectCode,
        projectName
      });
    }
  }
  const mapped = sliced.map((product) => {
    const links = product.productProjects
      .filter((link) => {
        const owner = auth.operationalClientId || auth.clientId;
        return !owner || link.project.clientId === owner;
      })
      .map((link) => ({
        projectId: link.projectId,
        code: link.project.code,
        name: link.project.name
      }));
    const stock = stockByProduct.get(product.id);
    const fallbackProject = links[0];
    return {
      id: product.id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      description: product.description,
      unit: product.unit,
      serialControlled: product.serialControlled,
      customer: null,
      productProjects: links,
      availableQty: stock ? stock.available.toString() : "0",
      locationCode: stock?.locationCode || "",
      warehouse: stock?.warehouse || "",
      projectCode: stock?.projectCode || fallbackProject?.code || "",
      projectName: stock?.projectName || fallbackProject?.name || "",
      hasStock: Boolean(stock)
    };
  });
  if (opts.requireStock && (locationFilter || warehouseFilter)) {
    return mapped.filter((product) => product.hasStock);
  }
  return mapped;
}

export async function getSkuContext(productId: string, auth: AuthContext) {
  const product = await prisma.product.findFirst({
    where: { AND: [{ id: productId }, clientProductWhere(auth)] },
    include: {
      inventories: {
        where: scopedInventoryWhere(auth),
        orderBy: [{ location: { warehouse: "asc" } }, { location: { code: "asc" } }],
        include: {
          location: { select: { id: true, code: true, warehouse: true } },
          client: {
            select: { id: true, code: true, name: true, legalName: true, tradeName: true, active: true }
          },
          project: {
            select: {
              id: true,
              code: true,
              name: true,
              client: {
                select: { id: true, name: true, legalName: true, tradeName: true, active: true }
              }
            }
          },
          layers: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              lotNumber: true,
              qty: true,
              reservedQty: true,
              receivedAt: true,
              unitPriceMxn: true,
              unitPriceUsd: true,
              sourceReference: true,
              sourceType: true
            }
          }
        }
      }
    }
  });
  if (!product) {
    throw new HttpError(404, "Producto no encontrado.");
  }

  const locations = product.inventories.map((inventory) => {
    const qty = inventory.qty;
    const reservedQty = inventory.reservedQty;
    const operationalProject =
      inventory.assignmentType === "PROJECT" &&
      inventory.project &&
      !isForbiddenInventoryProjectRecord(inventory.project)
        ? { id: inventory.project.id, code: inventory.project.code, name: inventory.project.name }
        : null;
    return {
      inventoryId: inventory.id,
      assignmentType: inventory.assignmentType,
      assignmentKey: inventory.assignmentKey,
      project: operationalProject,
      historicalAssignment:
        inventory.assignmentType === "PROJECT" && inventory.project && !operationalProject
          ? "HISTORICAL_NON_OPERATIONAL"
          : null,
      client: mapSkuClient(inventory.client || inventory.project?.client),
      warehouse: inventory.location.warehouse,
      locationId: inventory.location.id,
      locationCode: inventory.location.code,
      qty: qty.toString(),
      reservedQty: reservedQty.toString(),
      unreservedQty: qty.minus(reservedQty).toString(),
      status: inventory.status
    };
  });
  const totalQty = product.inventories.reduce((total, inventory) => total.plus(inventory.qty), new Prisma.Decimal(0));
  const totalReservedQty = product.inventories.reduce(
    (total, inventory) => total.plus(inventory.reservedQty),
    new Prisma.Decimal(0)
  );
  const projectQty = new Map<
    string,
    { id: string; code: string; name: string; qty: Prisma.Decimal; reservedQty: Prisma.Decimal }
  >();
  let freeToSaleQty = new Prisma.Decimal(0);
  let freeToSaleReserved = new Prisma.Decimal(0);
  let otherQty = new Prisma.Decimal(0);
  let otherReserved = new Prisma.Decimal(0);
  for (const inventory of product.inventories) {
    if (inventory.assignmentType === "FREE_TO_SALE") {
      freeToSaleQty = freeToSaleQty.plus(inventory.qty);
      freeToSaleReserved = freeToSaleReserved.plus(inventory.reservedQty);
      continue;
    }
    if (inventory.assignmentType === "PROJECT" && inventory.project && !isForbiddenInventoryProjectRecord(inventory.project)) {
      const current = projectQty.get(inventory.project.id) || {
        id: inventory.project.id,
        code: inventory.project.code,
        name: inventory.project.name,
        qty: new Prisma.Decimal(0),
        reservedQty: new Prisma.Decimal(0)
      };
      current.qty = current.qty.plus(inventory.qty);
      current.reservedQty = current.reservedQty.plus(inventory.reservedQty);
      projectQty.set(inventory.project.id, current);
      continue;
    }
    otherQty = otherQty.plus(inventory.qty);
    otherReserved = otherReserved.plus(inventory.reservedQty);
  }
  const operationalClient = mapSkuClient(
    product.inventories.find((inventory) => inventory.client)?.client ||
      product.inventories.find(
        (inventory) =>
          inventory.assignmentType === "PROJECT" &&
          inventory.project &&
          !isForbiddenInventoryProjectRecord(inventory.project) &&
          inventory.project.client
      )?.project?.client
  );
  const layers = product.inventories.flatMap((inventory) =>
    inventory.layers.map((layer) => ({
      id: layer.id,
      inventoryId: inventory.id,
      lotNumber: layer.lotNumber,
      qty: layer.qty.toString(),
      reservedQty: layer.reservedQty.toString(),
      receivedAt: layer.receivedAt,
      unitPriceMxn: layer.unitPriceMxn?.toString() ?? null,
      unitPriceUsd: layer.unitPriceUsd?.toString() ?? null,
      sourceReference: layer.sourceReference,
      sourceType: layer.sourceType
    }))
  );
  const serialCount = await prisma.inventorySerial.count({
    where: { AND: [{ productId: product.id }, clientSerialWhere(auth)] }
  });
  const exposeEconomic = canExposeEconomicValuation(auth.role);
  const valuation = calculateInventoryValuation(
    product.inventories.flatMap((inventory) => inventory.layers)
  );
  const stockAssignments = summarizeStockAssignments(product.inventories);
  const layerPreview = exposeEconomic
    ? layers.slice(0, 100)
    : layers.slice(0, 100).map(({ unitPriceMxn: _mxn, unitPriceUsd: _usd, ...rest }) => rest);

  return {
    product: {
      id: product.id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      description: product.description,
      unit: product.unit,
      serialControlled: product.serialControlled,
      lotControlled: product.lotControlled
    },
    client: operationalClient,
    project: null,
    catalogOwner: null,
    stockAssignments,
    assignmentBreakdown: {
      projects: [...projectQty.values()]
        .sort((a, b) => a.name.localeCompare(b.name, "es"))
        .map((row) => ({
          id: row.id,
          code: row.code,
          name: row.name,
          ...qtyTriplet(row.qty, row.reservedQty)
        })),
      freeToSale: qtyTriplet(freeToSaleQty, freeToSaleReserved),
      other: qtyTriplet(otherQty, otherReserved)
    },
    inventory: {
      totalQty: totalQty.toString(),
      totalReservedQty: totalReservedQty.toString(),
      totalUnreservedQty: totalQty.minus(totalReservedQty).toString(),
      locations
    },
    layers: {
      count: layers.length,
      preview: layerPreview
    },
    serializedQty: serialCount.toString(),
    ...(exposeEconomic ? { valuation } : {})
  };
}
