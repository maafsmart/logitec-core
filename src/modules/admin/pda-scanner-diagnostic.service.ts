import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma.js";

export type ScannerMatchType = "SKU" | "UBICACION" | "LOTE" | "SERIE_IMEI";

export type ScannerMatch = {
  type: ScannerMatchType;
  label: string;
  detail: string;
};

export type ScannerDiagnosticResult = {
  code: string;
  classification: ScannerMatchType | "AMBIGUO" | "NO_ENCONTRADO";
  matches: ScannerMatch[];
};

type ProductMatch = { sku: string; barcode: string | null; name: string };
type LocationMatch = { code: string; warehouse: string };
type LotMatch = { lotNumber: string | null; inventory: { product: { sku: string }; location: { code: string } } };
type SerialMatch = {
  serialNumber: string;
  imei: string | null;
  product: { sku: string };
  inventoryLayer: { inventory: { location: { code: string } } } | null;
};

export type ScannerDiagnosticReader = {
  findProducts(code: string, clientId: string): Promise<ProductMatch[]>;
  findLocations(code: string, clientId: string): Promise<LocationMatch[]>;
  findLots(code: string, clientId: string): Promise<LotMatch[]>;
  findSerials(code: string, clientId: string): Promise<SerialMatch[]>;
};

const exactInsensitive = (value: string): Prisma.StringFilter => ({
  equals: value,
  mode: "insensitive"
});

export const prismaScannerDiagnosticReader: ScannerDiagnosticReader = {
  findProducts(code, clientId) {
    return prisma.product.findMany({
      where: {
        AND: [
          {
            OR: [
              { inventories: { some: { clientId } } },
              { productProjects: { some: { active: true, project: { clientId } } } }
            ]
          },
          { OR: [{ sku: exactInsensitive(code) }, { barcode: exactInsensitive(code) }] }
        ]
      },
      select: { sku: true, barcode: true, name: true },
      orderBy: { sku: "asc" },
      take: 10
    });
  },
  findLocations(code, clientId) {
    return prisma.location.findMany({
      where: {
        code: exactInsensitive(code),
        inventories: { some: { clientId } }
      },
      select: { code: true, warehouse: true },
      orderBy: [{ warehouse: "asc" }, { code: "asc" }],
      take: 10
    });
  },
  findLots(code, clientId) {
    return prisma.inventoryLayer.findMany({
      where: {
        lotNumber: exactInsensitive(code),
        inventory: { clientId }
      },
      select: {
        lotNumber: true,
        inventory: {
          select: {
            product: { select: { sku: true } },
            location: { select: { code: true } }
          }
        }
      },
      orderBy: { createdAt: "asc" },
      take: 10
    });
  },
  findSerials(code, clientId) {
    return prisma.inventorySerial.findMany({
      where: {
        clientId,
        OR: [{ serialNumber: exactInsensitive(code) }, { imei: exactInsensitive(code) }]
      },
      select: {
        serialNumber: true,
        imei: true,
        product: { select: { sku: true } },
        inventoryLayer: {
          select: { inventory: { select: { location: { select: { code: true } } } } }
        }
      },
      orderBy: { createdAt: "asc" },
      take: 10
    });
  }
};

export async function classifyScannerCode(
  rawCode: string,
  clientId: string,
  reader: ScannerDiagnosticReader = prismaScannerDiagnosticReader
): Promise<ScannerDiagnosticResult> {
  const code = rawCode.trim();
  const [products, locations, lots, serials] = await Promise.all([
    reader.findProducts(code, clientId),
    reader.findLocations(code, clientId),
    reader.findLots(code, clientId),
    reader.findSerials(code, clientId)
  ]);

  const matches: ScannerMatch[] = [
    ...products.map((row) => ({
      type: "SKU" as const,
      label: row.sku,
      detail: `${row.name}${row.barcode && row.barcode.toLowerCase() === code.toLowerCase() ? ` · barcode ${row.barcode}` : ""}`
    })),
    ...locations.map((row) => ({
      type: "UBICACION" as const,
      label: row.code,
      detail: `Almacén ${row.warehouse}`
    })),
    ...lots.map((row) => ({
      type: "LOTE" as const,
      label: row.lotNumber || code,
      detail: `${row.inventory.product.sku} · ubicación ${row.inventory.location.code}`
    })),
    ...serials.map((row) => ({
      type: "SERIE_IMEI" as const,
      label: row.imei?.toLowerCase() === code.toLowerCase() ? row.imei : row.serialNumber,
      detail: `${row.product.sku} · ubicación ${row.inventoryLayer?.inventory.location.code || "sin ubicación"}`
    }))
  ];

  const types = [...new Set(matches.map((match) => match.type))];
  return {
    code,
    classification: types.length > 1 ? "AMBIGUO" : types[0] || "NO_ENCONTRADO",
    matches
  };
}
