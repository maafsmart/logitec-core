-- Tenant-scoped uniqueness for InventorySerial (non-destructive: indexes only).

DROP INDEX IF EXISTS "InventorySerial_productId_serialNumber_key";
DROP INDEX IF EXISTS "InventorySerial_imei_key";

CREATE UNIQUE INDEX "InventorySerial_clientId_productId_serialNumber_key"
  ON "InventorySerial"("clientId", "productId", "serialNumber");

CREATE UNIQUE INDEX "InventorySerial_clientId_imei_key"
  ON "InventorySerial"("clientId", "imei");
