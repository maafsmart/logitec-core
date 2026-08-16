import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../shared/http-error.js";
import { clientProductWhere } from "../clients/client-scope.js";
import type { UserRole } from "../../middlewares/auth.middleware.js";

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
  }
} as const;

function normalized(value: string | null | undefined): string {
  return (value || "").trim().toLocaleLowerCase();
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
        : null
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
        orderBy: [{ location: { warehouse: "asc" } }, { location: { code: "asc" } }],
        include: { location: { select: { id: true, code: true, warehouse: true } } }
      }
    }
  });
  if (!product) {
    throw new HttpError(404, "Producto no encontrado.");
  }

  const locations = product.inventories.map((inventory) => {
    const qty = inventory.qty;
    const reservedQty = inventory.reservedQty;
    return {
      inventoryId: inventory.id,
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
    client: product.customer?.client
      ? {
          id: product.customer.client.id,
          name: product.customer.client.name,
          tradeName: product.customer.client.tradeName,
          legalName: product.customer.client.legalName
        }
      : null,
    project: product.customer
      ? { id: product.customer.id, code: product.customer.code, name: product.customer.name }
      : null,
    inventory: {
      totalQty: totalQty.toString(),
      totalReservedQty: totalReservedQty.toString(),
      totalUnreservedQty: totalQty.minus(totalReservedQty).toString(),
      locations
    }
  };
}
