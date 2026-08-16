-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "inventorySerialId" TEXT;

-- CreateTable
CREATE TABLE "InventoryLayer" (
    "id" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "lotNumber" TEXT,
    "qty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reservedQty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3),
    "unitPriceMxn" DECIMAL(18,4),
    "unitPriceUsd" DECIMAL(18,4),
    "sourceReference" TEXT,
    "sourceType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryLayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventorySerial" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "inventoryLayerId" TEXT,
    "serialNumber" TEXT NOT NULL,
    "imei" TEXT,
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventorySerial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryStatusDefinition" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "pickable" BOOLEAN,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryStatusDefinition_pkey" PRIMARY KEY ("code")
);

-- Preserve every existing aggregate balance as one neutral legacy layer.
-- No lot, serial, IMEI, price, or received date is inferred.
INSERT INTO "InventoryLayer" (
    "id", "inventoryId", "lotNumber", "qty", "reservedQty", "receivedAt",
    "unitPriceMxn", "unitPriceUsd", "sourceReference", "sourceType", "createdAt", "updatedAt"
)
SELECT
    'legacy_' || md5("id" || clock_timestamp()::text),
    "id",
    NULL,
    "qty",
    "reservedQty",
    NULL,
    NULL,
    NULL,
    NULL,
    'LEGACY_BACKFILL',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Inventory";

-- Catalog current status codes exactly as stored; pickability remains undecided.
INSERT INTO "InventoryStatusDefinition" (
    "code", "label", "active", "pickable", "description", "sortOrder", "createdAt", "updatedAt"
)
SELECT
    status_values."status",
    status_values."status",
    true,
    NULL,
    NULL,
    ROW_NUMBER() OVER (ORDER BY status_values."status"),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "status" FROM "Inventory") AS status_values;

-- CreateIndex
CREATE INDEX "InventoryLayer_inventoryId_idx" ON "InventoryLayer"("inventoryId");

-- CreateIndex
CREATE INDEX "InventoryLayer_lotNumber_idx" ON "InventoryLayer"("lotNumber");

-- CreateIndex
CREATE UNIQUE INDEX "InventorySerial_imei_key" ON "InventorySerial"("imei");

-- CreateIndex
CREATE INDEX "InventorySerial_inventoryLayerId_idx" ON "InventorySerial"("inventoryLayerId");

-- CreateIndex
CREATE UNIQUE INDEX "InventorySerial_productId_serialNumber_key" ON "InventorySerial"("productId", "serialNumber");

-- CreateIndex
CREATE INDEX "InventoryMovement_inventorySerialId_idx" ON "InventoryMovement"("inventorySerialId");

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_inventorySerialId_fkey" FOREIGN KEY ("inventorySerialId") REFERENCES "InventorySerial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryLayer" ADD CONSTRAINT "InventoryLayer_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySerial" ADD CONSTRAINT "InventorySerial_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventorySerial" ADD CONSTRAINT "InventorySerial_inventoryLayerId_fkey" FOREIGN KEY ("inventoryLayerId") REFERENCES "InventoryLayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
