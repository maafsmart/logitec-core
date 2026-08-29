-- Staff must belong to a real Client. Remaining ownerless scans are attributed
-- to the unique AVIAT Client. Location uniqueness becomes warehouse + code.
-- Does not infer ownership from SKU, product, lot, username or free text.

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

UPDATE "User"
SET "clientId" = (SELECT id FROM _aviat_owner)
WHERE "clientId" IS NULL
  AND "role" IN ('SUPERVISOR', 'OPERATOR');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "User"
    WHERE "role" IN ('SUPERVISOR', 'OPERATOR', 'CLIENT')
      AND "clientId" IS NULL
  ) THEN
    RAISE EXCEPTION 'USER_CLIENT_BACKFILL_FAILED: SUPERVISOR, OPERATOR o CLIENT quedaron sin cliente.';
  END IF;
END $$;

ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_scoped_role_client_required";
ALTER TABLE "User"
  ADD CONSTRAINT "User_scoped_role_client_required"
  CHECK (("role" = 'ADMIN') OR ("clientId" IS NOT NULL));

UPDATE "ScanEvent"
SET "clientId" = (SELECT id FROM _aviat_owner)
WHERE "clientId" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ScanEvent" WHERE "clientId" IS NULL) THEN
    RAISE EXCEPTION 'SCAN_CLIENT_BACKFILL_FAILED: quedaron scans sin cliente propietario.';
  END IF;
END $$;

ALTER TABLE "ScanEvent" DROP CONSTRAINT IF EXISTS "ScanEvent_clientId_fkey";
ALTER TABLE "ScanEvent" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "ScanEvent"
  ADD CONSTRAINT "ScanEvent_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname = 'Location_warehouseId_code_key'
  ) THEN
    RAISE EXCEPTION 'LOCATION_COMPOSITE_UNIQUE_MISSING: no se eliminará Location_code_key sin el unique por almacén.';
  END IF;
END $$;

DROP INDEX IF EXISTS "Location_code_key";
