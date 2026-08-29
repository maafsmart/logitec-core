-- Master-data fields for real 3PL clients, project operational data,
-- warehouse catalog and location extras. Does not rewrite inventory FKs.
-- Does not infer or backfill Customer.clientId from product/lot names.

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "contactTitle" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "contactEmail" TEXT;

-- Production can have operational AVIAT inventory with an empty Client catalog.
-- Create the unique official tenant only when no Client exists and inventory does.
INSERT INTO "Client" ("id", "name", "code", "legalName", "tradeName", "active", "createdAt", "updatedAt")
SELECT
  'cl_aviat_official',
  'AVIAT',
  'AVIAT',
  'AVIAT',
  'AVIAT',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Client")
  AND EXISTS (SELECT 1 FROM "Inventory");

UPDATE "Client"
SET "code" = 'AVIAT'
WHERE "code" IS NULL
  AND (
    UPPER(TRIM("name")) = 'AVIAT'
    OR UPPER(TRIM(COALESCE("tradeName", ''))) = 'AVIAT'
    OR UPPER(TRIM(COALESCE("legalName", ''))) = 'AVIAT'
  );

UPDATE "Client"
SET "code" = UPPER(REGEXP_REPLACE(COALESCE(NULLIF(TRIM("name"), ''), "id"), '[^A-Za-z0-9]+', '', 'g'))
WHERE "code" IS NULL OR TRIM("code") = '';

WITH ranked AS (
  SELECT
    "id",
    "code",
    ROW_NUMBER() OVER (PARTITION BY "code" ORDER BY "createdAt" ASC, "id" ASC) AS rn
  FROM "Client"
)
UPDATE "Client" AS c
SET "code" = ranked."code" || '_' || SUBSTRING(ranked."id" FROM 1 FOR 6)
FROM ranked
WHERE c."id" = ranked."id" AND ranked.rn > 1;

ALTER TABLE "Client" ALTER COLUMN "code" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Client_code_key" ON "Client"("code");

ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "tradeName" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "legalName" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "rfc" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "primaryContact" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "contactTitle" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "contactPhone" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "contactEmail" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "notes" TEXT;

CREATE TABLE IF NOT EXISTS "Warehouse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "manager" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "hours" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Warehouse_code_key" ON "Warehouse"("code");

INSERT INTO "Warehouse" ("id", "code", "name", "active", "createdAt", "updatedAt")
SELECT
  'wh_' || md5(UPPER(TRIM("warehouse"))),
  UPPER(TRIM("warehouse")),
  UPPER(TRIM("warehouse")),
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Location"
WHERE TRIM("warehouse") <> ''
GROUP BY UPPER(TRIM("warehouse"))
ON CONFLICT ("code") DO NOTHING;

ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "notes" TEXT;
