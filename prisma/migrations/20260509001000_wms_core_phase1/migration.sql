-- Core WMS entities
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "warehouse" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "rack" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Location_code_key" ON "Location"("code");
CREATE INDEX "Location_warehouse_idx" ON "Location"("warehouse");

CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reservedQty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Inventory_productId_locationId_status_key" ON "Inventory"("productId", "locationId", "status");
CREATE INDEX "Inventory_locationId_status_idx" ON "Inventory"("locationId", "status");

-- Product enrichment
ALTER TABLE "Product" ADD COLUMN "customerId" TEXT;
ALTER TABLE "Product" ADD COLUMN "description" TEXT;
ALTER TABLE "Product" ADD COLUMN "unit" TEXT NOT NULL DEFAULT 'EA';
ALTER TABLE "Product" ADD COLUMN "serialControlled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "lotControlled" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "Product_customerId_idx" ON "Product"("customerId");

-- Movement and scan enrichment
ALTER TABLE "InventoryMovement" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'ADJUSTMENT';
ALTER TABLE "InventoryMovement" ADD COLUMN "qty" DECIMAL(18,4) NOT NULL DEFAULT 0;
ALTER TABLE "InventoryMovement" ADD COLUMN "fromLocationId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "toLocationId" TEXT;
ALTER TABLE "InventoryMovement" ALTER COLUMN "warehouse" DROP NOT NULL;
CREATE INDEX "InventoryMovement_fromLocationId_idx" ON "InventoryMovement"("fromLocationId");
CREATE INDEX "InventoryMovement_toLocationId_idx" ON "InventoryMovement"("toLocationId");

ALTER TABLE "ScanEvent" ADD COLUMN "warehouse" TEXT;
ALTER TABLE "ScanEvent" ADD COLUMN "location" TEXT;

-- Foreign keys
ALTER TABLE "Product" ADD CONSTRAINT "Product_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_locationId_fkey"
FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_fromLocationId_fkey"
FOREIGN KEY ("fromLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_toLocationId_fkey"
FOREIGN KEY ("toLocationId") REFERENCES "Location"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default customer for immediate use
INSERT INTO "Customer" ("id", "code", "name", "active", "createdAt")
VALUES ('customer_logitec_default', 'LOGITEC', 'Logitec', true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

UPDATE "Product"
SET "customerId" = COALESCE("customerId", 'customer_logitec_default')
WHERE "customerId" IS NULL;

-- Backfill inventory from legacy InventoryStock
INSERT INTO "Location" ("id", "warehouse", "zone", "rack", "level", "position", "code", "active", "createdAt", "updatedAt")
SELECT DISTINCT
  ('loc_' || md5(random()::text || s."warehouse"))::text AS "id",
  UPPER(s."warehouse") AS "warehouse",
  'GEN' AS "zone",
  'STAGE' AS "rack",
  '01' AS "level",
  '01' AS "position",
  UPPER(s."warehouse") || '-GEN-STAGE-01' AS "code",
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "InventoryStock" s
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "Inventory" ("id", "productId", "locationId", "qty", "reservedQty", "status", "updatedAt")
SELECT
  ('inv_' || md5(random()::text || s."id"))::text AS "id",
  s."productId",
  l."id",
  s."quantity" AS "qty",
  0 AS "reservedQty",
  'AVAILABLE' AS "status",
  CURRENT_TIMESTAMP
FROM "InventoryStock" s
JOIN "Location" l ON l."code" = UPPER(s."warehouse") || '-GEN-STAGE-01'
ON CONFLICT ("productId", "locationId", "status")
DO UPDATE SET "qty" = EXCLUDED."qty", "updatedAt" = CURRENT_TIMESTAMP;
