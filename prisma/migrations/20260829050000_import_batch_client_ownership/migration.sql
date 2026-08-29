-- ImportBatch ownership by real Client.
-- Existing batches belong to the creator's bound client when present;
-- otherwise they are attributed to the unique AVIAT Client.
-- Does not infer ownership from catalog codes, product, lot, location or free text.

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

ALTER TABLE "ImportBatch" ADD COLUMN "clientId" TEXT;

UPDATE "ImportBatch" AS b
SET "clientId" = COALESCE(
  (
    SELECT u."clientId"
    FROM "User" u
    WHERE u."id" = b."createdById"
      AND u."clientId" IS NOT NULL
  ),
  (SELECT id FROM _aviat_owner)
)
WHERE b."clientId" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ImportBatch" WHERE "clientId" IS NULL) THEN
    RAISE EXCEPTION 'IMPORT_BATCH_CLIENT_BACKFILL_FAILED: quedaron importaciones sin cliente propietario.';
  END IF;
END $$;

ALTER TABLE "ImportBatch" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "ImportBatch"
  ADD CONSTRAINT "ImportBatch_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ImportBatch_clientId_idx" ON "ImportBatch"("clientId");
CREATE INDEX "ImportBatch_clientId_createdAt_idx" ON "ImportBatch"("clientId", "createdAt");
