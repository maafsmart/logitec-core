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
