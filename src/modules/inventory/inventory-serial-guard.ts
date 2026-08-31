import { Prisma } from "@prisma/client";
import { InventoryMutationError } from "./inventory-errors.js";

export async function assertNoSerialAmbiguity(tx: Prisma.TransactionClient, layerId: string) {
  const serialCount = await tx.inventorySerial.count({ where: { inventoryLayerId: layerId } });
  if (serialCount > 0) {
    throw new InventoryMutationError(
      "SERIAL_SELECTION_REQUIRED",
      "La capa contiene series; requiere selección explícita de seriales."
    );
  }
}

export type RelocateSerialRow = {
  id: string;
  productId: string;
  clientId: string;
  inventoryLayerId: string | null;
  serialNumber: string;
  imei: string | null;
};

export function normalizeRelocateSerialIds(raw: string[] | null | undefined): string[] {
  return (Array.isArray(raw) ? raw : []).map((id) => String(id || "").trim()).filter(Boolean);
}

export function relocateSerialCountMessage(expected: number, actual: number): string {
  const missing = expected - actual;
  if (missing > 0) {
    return `Faltan ${missing} series. Elige exactamente ${expected} series para reubicar ${expected} piezas.`;
  }
  if (missing < 0) {
    return `Hay ${-missing} series de más. Elige exactamente ${expected} series para reubicar ${expected} piezas.`;
  }
  return `Seleccionaste ${expected} series.`;
}

export function assertRelocateSerialSelection(ids: string[], qty: Prisma.Decimal) {
  if (!qty.isInteger() || qty.lessThanOrEqualTo(0)) {
    throw new InventoryMutationError(
      "SERIAL_QTY_NOT_INTEGER",
      "La cantidad serializada debe ser un entero positivo."
    );
  }
  const expected = Number(qty);
  if (ids.length !== expected) {
    throw new InventoryMutationError("SERIAL_COUNT_MISMATCH", relocateSerialCountMessage(expected, ids.length), {
      expected,
      actual: ids.length
    });
  }
  if (new Set(ids).size !== ids.length) {
    throw new InventoryMutationError("SERIAL_DUPLICATE", "Hay series duplicadas.");
  }
}

export async function lockInventorySerialsById(tx: Prisma.TransactionClient, ids: string[]) {
  if (!ids.length) return;
  const sorted = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
  await tx.$queryRaw(
    Prisma.sql`SELECT "id" FROM "InventorySerial" WHERE "id" IN (${Prisma.join(sorted)}) ORDER BY "id" FOR UPDATE`
  );
}

export function groupRelocateSerialsByLayer(
  serials: RelocateSerialRow[],
  args: {
    productId: string;
    clientId: string;
    sourceLayerIds: Set<string>;
    requiredLayerId?: string;
  }
): Map<string, RelocateSerialRow[]> {
  const grouped = new Map<string, RelocateSerialRow[]>();
  for (const serial of serials) {
    if (serial.productId !== args.productId) {
      throw new InventoryMutationError(
        "SERIAL_PRODUCT_MISMATCH",
        "La serie no pertenece al producto seleccionado."
      );
    }
    if (serial.clientId !== args.clientId) {
      throw new InventoryMutationError(
        "SERIAL_CLIENT_MISMATCH",
        "La serie no pertenece al cliente operativo."
      );
    }
    if (!serial.inventoryLayerId) {
      throw new InventoryMutationError("SERIAL_ALREADY_SHIPPED", "La serie ya no está en inventario.");
    }
    if (!args.sourceLayerIds.has(serial.inventoryLayerId)) {
      throw new InventoryMutationError(
        "SERIAL_LAYER_MISMATCH",
        "La serie no pertenece a las capas origen de este saldo."
      );
    }
    if (args.requiredLayerId && serial.inventoryLayerId !== args.requiredLayerId) {
      throw new InventoryMutationError(
        "SERIAL_LAYER_MISMATCH",
        "La serie no pertenece a la capa origen indicada."
      );
    }
    const list = grouped.get(serial.inventoryLayerId) || [];
    list.push(serial);
    grouped.set(serial.inventoryLayerId, list);
  }
  return grouped;
}
