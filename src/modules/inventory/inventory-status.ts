import { prisma } from "../../db/prisma.js";
import { HttpError } from "../../shared/http-error.js";

export const INVALID_INVENTORY_STATUS_MESSAGE = "Estado de inventario no válido o inactivo.";

export function normalizeInventoryStatusCode(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

export async function assertActiveInventoryStatus(raw: unknown): Promise<string> {
  const normalized = normalizeInventoryStatusCode(raw);
  if (!normalized || normalized.length > 80) {
    throw new HttpError(400, INVALID_INVENTORY_STATUS_MESSAGE);
  }
  const definition = await prisma.inventoryStatusDefinition.findFirst({
    where: { code: { equals: normalized, mode: "insensitive" } },
    select: { code: true, active: true }
  });
  if (!definition?.active) {
    throw new HttpError(400, INVALID_INVENTORY_STATUS_MESSAGE);
  }
  return definition.code;
}
