-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "inventoryLayerId" TEXT;

-- CreateIndex
CREATE INDEX "InventoryMovement_inventoryLayerId_idx" ON "InventoryMovement"("inventoryLayerId");

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_inventoryLayerId_fkey" FOREIGN KEY ("inventoryLayerId") REFERENCES "InventoryLayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
