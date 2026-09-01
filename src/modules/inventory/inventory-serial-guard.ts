import { Prisma } from "@prisma/client";
import { InventoryMutationError } from "./inventory-errors.js";

export async function resolveEffectiveSerialControlled(
  tx: Prisma.TransactionClient,
  product: { id: string; serialControlled: boolean },
  clientId: string
): Promise<boolean> {
  if (product.serialControlled) return true;
  const existing = await tx.inventorySerial.findFirst({
    where: { productId: product.id, clientId },
    select: { id: true }
  });
  return Boolean(existing);
}

export async function assertNoSerialAmbiguity(tx: Prisma.TransactionClient, layerId: string) {
  const serialCount = await tx.inventorySerial.count({ where: { inventoryLayerId: layerId } });
  if (serialCount > 0) {
    throw new InventoryMutationError(
      "SERIAL_SELECTION_REQUIRED",
      "La capa contiene series; requiere selección explícita de seriales. Selecciona o escanea las series de esta capa; el botón Confirmar se habilita al completar la selección."
    );
  }
}
