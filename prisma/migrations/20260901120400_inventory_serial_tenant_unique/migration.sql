-- Tenant-scoped uniqueness for InventorySerial (failure-safe: CREATE before DROP).

CREATE UNIQUE INDEX "InventorySerial_clientId_productId_serialNumber_key"
  ON "InventorySerial"("clientId", "productId", "serialNumber");

CREATE UNIQUE INDEX "InventorySerial_clientId_imei_key"
  ON "InventorySerial"("clientId", "imei");

DROP INDEX IF EXISTS "InventorySerial_productId_serialNumber_key";
DROP INDEX IF EXISTS "InventorySerial_imei_key";
