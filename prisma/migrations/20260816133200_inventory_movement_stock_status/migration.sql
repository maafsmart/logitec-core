-- Preserve the historical inventory status used by new physical movements.
-- Existing movements intentionally remain NULL: there is no reliable source to backfill them.
ALTER TABLE "InventoryMovement"
ADD COLUMN "stockStatus" TEXT;
