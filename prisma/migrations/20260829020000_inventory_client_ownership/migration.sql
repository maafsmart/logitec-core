-- Inventory, project and historical ownership by real Client.
-- Existing operational data is attributed to the unique AVIAT Client.
-- Does not infer ownership from SKU, product, lot, location or free text.

DO $$
DECLARE
  aviat_n INTEGER;
  aviat_id TEXT;
BEGIN
  SELECT COUNT(*), MIN(id)
  INTO aviat_n, aviat_id
  FROM (
    SELECT DISTINCT id
    FROM "Client"
    WHERE UPPER(TRIM("code")) = 'AVIAT'
       OR UPPER(TRIM("name")) = 'AVIAT'
       OR UPPER(TRIM(COALESCE("tradeName", ''))) = 'AVIAT'
       OR UPPER(TRIM(COALESCE("legalName", ''))) = 'AVIAT'
  ) AS matches;

  IF aviat_n <> 1 THEN
    RAISE EXCEPTION 'AVIAT_CLIENT_NOT_UNIQUE: se requiere exactamente un cliente AVIAT inequívoco (encontrados %).', aviat_n;
  END IF;

  CREATE TEMP TABLE _aviat_owner (
    id TEXT PRIMARY KEY
  ) ON COMMIT DROP;
  INSERT INTO _aviat_owner (id) VALUES (aviat_id);
END $$;

UPDATE "Customer"
SET "clientId" = (SELECT id FROM _aviat_owner)
WHERE "clientId" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Customer" WHERE "clientId" IS NULL) THEN
    RAISE EXCEPTION 'CUSTOMER_CLIENT_BACKFILL_FAILED: quedaron proyectos sin cliente propietario.';
  END IF;
END $$;

ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_clientId_fkey";
ALTER TABLE "Customer" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Inventory" ADD COLUMN "clientId" TEXT;

UPDATE "Inventory"
SET "clientId" = (SELECT id FROM _aviat_owner)
WHERE "clientId" IS NULL;

DO $$
DECLARE
  aviat_id TEXT := (SELECT id FROM _aviat_owner);
  collision_n INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO collision_n
  FROM (
    SELECT 1
    FROM "Inventory"
    WHERE "assignmentType" = 'FREE_TO_SALE'
    GROUP BY "productId", "locationId", "status",
      CASE
        WHEN "assignmentKey" = 'FREE_TO_SALE' THEN 'FREE_TO_SALE:' || aviat_id
        ELSE "assignmentKey"
      END
    HAVING COUNT(*) > 1
  ) AS collisions;

  IF collision_n > 0 THEN
    RAISE EXCEPTION 'FTS_ASSIGNMENT_KEY_COLLISION: no se fusionarán cubos Free to Sale (% grupos).', collision_n;
  END IF;

  SELECT COUNT(*)
  INTO collision_n
  FROM (
    SELECT 1
    FROM "Inventory"
    WHERE "assignmentType" = 'LEGACY_UNASSIGNED'
    GROUP BY "productId", "locationId", "status",
      CASE
        WHEN "assignmentKey" = 'LEGACY_UNASSIGNED' THEN 'LEGACY_UNASSIGNED:' || aviat_id
        ELSE "assignmentKey"
      END
    HAVING COUNT(*) > 1
  ) AS collisions;

  IF collision_n > 0 THEN
    RAISE EXCEPTION 'LEGACY_ASSIGNMENT_KEY_COLLISION: no se fusionarán cubos LEGACY_UNASSIGNED (% grupos).', collision_n;
  END IF;
END $$;

ALTER TABLE "Inventory" DROP CONSTRAINT IF EXISTS "Inventory_assignment_coherence_check";

UPDATE "Inventory"
SET "assignmentKey" = 'FREE_TO_SALE:' || "clientId"
WHERE "assignmentType" = 'FREE_TO_SALE'
  AND "assignmentKey" = 'FREE_TO_SALE';

UPDATE "Inventory"
SET "assignmentKey" = 'LEGACY_UNASSIGNED:' || "clientId"
WHERE "assignmentType" = 'LEGACY_UNASSIGNED'
  AND "assignmentKey" = 'LEGACY_UNASSIGNED';

ALTER TABLE "Inventory" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "Inventory"
  ADD CONSTRAINT "Inventory_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Inventory_clientId_idx" ON "Inventory"("clientId");

ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_assignment_coherence_check" CHECK (
    (
        "assignmentType" = 'PROJECT'
        AND "projectId" IS NOT NULL
        AND "assignmentKey" = ('P:' || "projectId")
    )
    OR (
        "assignmentType" = 'FREE_TO_SALE'
        AND "projectId" IS NULL
        AND "assignmentKey" = ('FREE_TO_SALE:' || "clientId")
    )
    OR (
        "assignmentType" = 'LEGACY_UNASSIGNED'
        AND "projectId" IS NULL
        AND "assignmentKey" = ('LEGACY_UNASSIGNED:' || "clientId")
    )
);

ALTER TABLE "InventoryMovement" ADD COLUMN "clientId" TEXT;
UPDATE "InventoryMovement"
SET "clientId" = (SELECT id FROM _aviat_owner)
WHERE "clientId" IS NULL;
ALTER TABLE "InventoryMovement" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "InventoryMovement"
  ADD CONSTRAINT "InventoryMovement_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "InventoryMovement_clientId_idx" ON "InventoryMovement"("clientId");

ALTER TABLE "InventorySerial" ADD COLUMN "clientId" TEXT;
UPDATE "InventorySerial"
SET "clientId" = (SELECT id FROM _aviat_owner)
WHERE "clientId" IS NULL;
ALTER TABLE "InventorySerial" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "InventorySerial"
  ADD CONSTRAINT "InventorySerial_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "InventorySerial_clientId_idx" ON "InventorySerial"("clientId");

ALTER TABLE "ScanEvent" ADD COLUMN "clientId" TEXT;
UPDATE "ScanEvent"
SET "clientId" = (SELECT id FROM _aviat_owner)
WHERE "clientId" IS NULL;
ALTER TABLE "ScanEvent"
  ADD CONSTRAINT "ScanEvent_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ScanEvent_clientId_idx" ON "ScanEvent"("clientId");

ALTER TABLE "ActivityLog" ADD COLUMN "clientId" TEXT;
UPDATE "ActivityLog"
SET "clientId" = (SELECT id FROM _aviat_owner)
WHERE "clientId" IS NULL;
ALTER TABLE "ActivityLog"
  ADD CONSTRAINT "ActivityLog_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "ActivityLog_clientId_idx" ON "ActivityLog"("clientId");

ALTER TABLE "Location" ADD COLUMN "warehouseId" TEXT;

UPDATE "Location" AS loc
SET
  "warehouseId" = wh.id,
  "warehouse" = wh.code
FROM "Warehouse" AS wh
WHERE wh.code = UPPER(TRIM(loc."warehouse"));

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Location" WHERE "warehouseId" IS NULL OR TRIM(COALESCE("warehouse", '')) = '') THEN
    RAISE EXCEPTION 'LOCATION_WAREHOUSE_UNLINKED: hay ubicaciones sin almacén inequívoco; no se adivinará la relación.';
  END IF;
END $$;

ALTER TABLE "Location" ALTER COLUMN "warehouseId" SET NOT NULL;
ALTER TABLE "Location"
  ADD CONSTRAINT "Location_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Location_warehouseId_idx" ON "Location"("warehouseId");
CREATE UNIQUE INDEX "Location_warehouseId_code_key" ON "Location"("warehouseId", "code");
