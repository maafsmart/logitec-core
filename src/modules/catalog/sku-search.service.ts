import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../shared/http-error.js";
import { clientInventoryWhere, clientProductWhere, clientSerialWhere, isClientRole } from "../clients/client-scope.js";
import type { UserRole } from "../../middlewares/auth.middleware.js";
import { calculateInventoryValuation, summarizeStockAssignments } from "../inventory/inventory-valuation.service.js";
import { canExposeEconomicValuation } from "../inventory/inventory-economic-access.js";
import { isForbiddenInventoryProjectRecord } from "../inventory/inventory-project-rules.js";

type AuthContext = {
  role: UserRole;
  clientId: string | null;
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
      project: { select: { id: true, code: true, name: true } }
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
  customer: { code: string; name: string; client: { name: string; legalName: string | null; tradeName: string | null } | null } | null;
}, query: string): number {
  const exact = [product.sku, product.barcode].some((value) => normalized(value) === query);
  if (exact) return 1000;
  const starts = [product.sku, product.barcode].some((value) => normalized(value).startsWith(query));
  if (starts) return 800;
  if (normalized(product.name).startsWith(query)) return 600;
  if (normalized(product.customer?.code).startsWith(query) || normalized(product.customer?.name).startsWith(query)) return 500;
  if (
    normalized(product.customer?.client?.tradeName).startsWith(query) ||
    normalized(product.customer?.client?.legalName).startsWith(query) ||
    normalized(product.customer?.client?.name).startsWith(query)
  ) return 450;
  return 100;
}

export async function searchSkuProducts(query: string, auth: AuthContext, take = 30) {
  const q = query.trim();
  if (!q) return [];
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
            customer: {
              OR: [
                { code: { contains: q, mode: "insensitive" } },
                { name: { contains: q, mode: "insensitive" } },
                {
                  client: {
                    OR: [
                      { name: { contains: q, mode: "insensitive" } },
                      { legalName: { contains: q, mode: "insensitive" } },
                      { tradeName: { contains: q, mode: "insensitive" } }
                    ]
                  }
                }
              ]
            }
          },
          {
            productProjects: {
              some: {
                active: true,
                project: {
                  OR: [
                    { code: { contains: q, mode: "insensitive" } },
                    { name: { contains: q, mode: "insensitive" } },
                    {
                      client: {
                        OR: [
                          { name: { contains: q, mode: "insensitive" } },
                          { legalName: { contains: q, mode: "insensitive" } },
                          { tradeName: { contains: q, mode: "insensitive" } }
                        ]
                      }
                    }
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
  return rows
    .sort((a, b) => {
      const score = matchScore(b, normalizedQuery) - matchScore(a, normalizedQuery);
      return score || a.sku.localeCompare(b.sku, "es");
    })
    .slice(0, take)
    .map((product) => ({
      id: product.id,
      sku: product.sku,
      barcode: product.barcode,
      name: product.name,
      description: product.description,
      unit: product.unit,
      customer: product.customer
        ? {
            id: product.customer.id,
            code: product.customer.code,
            name: product.customer.name,
            client: product.customer.client
          }
        : null,
      productProjects: product.productProjects.map((link) => ({
        projectId: link.projectId,
        code: link.project.code,
        name: link.project.name
      }))
    }));
}

export async function getSkuContext(productId: string, auth: AuthContext) {
  const product = await prisma.product.findFirst({
    where: { AND: [{ id: productId }, clientProductWhere(auth)] },
    include: {
      customer: {
        include: {
          client: {
            select: { id: true, name: true, legalName: true, tradeName: true, active: true }
          }
        }
      },
      inventories: {
        where: clientInventoryWhere(auth),
        orderBy: [{ location: { warehouse: "asc" } }, { location: { code: "asc" } }],
        include: {
          location: { select: { id: true, code: true, warehouse: true } },
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
      client: mapSkuClient(inventory.project?.client),
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
    catalogOwner:
      product.customer && !isForbiddenInventoryProjectRecord(product.customer)
        ? { id: product.customer.id, code: product.customer.code, name: product.customer.name }
        : product.customer
          ? { id: product.customer.id, code: product.customer.code, name: product.customer.name, historical: true }
          : null,
    stockAssignments,
    assignmentBreakdown: isClientRole(auth)
      ? {
          projects: [...projectQty.values()]
            .sort((a, b) => a.name.localeCompare(b.name, "es"))
            .map((row) => ({
              id: row.id,
              code: row.code,
              name: row.name,
              ...qtyTriplet(row.qty, row.reservedQty)
            }))
        }
      : {
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
