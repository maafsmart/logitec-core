-- ImportBatch ownership by real Client.
-- ADMIN ownership is derived only when every staged row carries the same
-- validated clientId. It never falls back to AVIAT merely because the creator
-- is a global ADMIN. Ambiguous or incomplete batches abort the migration.

ALTER TABLE "ImportBatch" ADD COLUMN "clientId" TEXT;

CREATE TEMP TABLE _import_batch_row_owner (
  "batchId" TEXT PRIMARY KEY,
  "clientId" TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO _import_batch_row_owner ("batchId", "clientId")
SELECT
  b.id,
  MIN(NULLIF(TRIM(r.normalized->>'clientId'), '')) AS "clientId"
FROM "ImportBatch" b
JOIN "ImportRow" r ON r."importBatchId" = b.id
GROUP BY b.id
HAVING COUNT(*) > 0
   AND COUNT(*) FILTER (
     WHERE r.normalized IS NOT NULL
       AND NULLIF(TRIM(r.normalized->>'clientId'), '') IS NOT NULL
   ) = COUNT(*)
   AND COUNT(DISTINCT NULLIF(TRIM(r.normalized->>'clientId'), '')) = 1;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM _import_batch_row_owner o
    LEFT JOIN "Client" c ON c.id = o."clientId"
    WHERE c.id IS NULL
  ) THEN
    RAISE EXCEPTION 'IMPORT_BATCH_CLIENT_INVALID: una importación referencia un cliente inexistente.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ImportRow" r
    JOIN _import_batch_row_owner o ON o."batchId" = r."importBatchId"
    LEFT JOIN "Customer" p ON p.id = NULLIF(TRIM(r.normalized->>'projectId'), '')
    WHERE r.normalized->>'assignmentType' = 'PROJECT'
      AND (
        p.id IS NULL
        OR p."clientId" <> o."clientId"
      )
  ) THEN
    RAISE EXCEPTION 'IMPORT_BATCH_PROJECT_CLIENT_MISMATCH: el proyecto normalizado no pertenece al cliente de la importación.';
  END IF;
END $$;

UPDATE "ImportBatch" AS b
SET "clientId" = o."clientId"
FROM _import_batch_row_owner o
WHERE o."batchId" = b.id
  AND b."clientId" IS NULL;

-- Scoped staff cannot change operational tenant; their required User.clientId
-- is deterministic for batches that have no complete normalized-row evidence.
UPDATE "ImportBatch" AS b
SET "clientId" = u."clientId"
FROM "User" u
WHERE u.id = b."createdById"
  AND u.role <> 'ADMIN'
  AND u."clientId" IS NOT NULL
  AND b."clientId" IS NULL;

-- Legacy fallback is based on a provably single-client catalog, never on the
-- creator being ADMIN. If any second Client exists, unresolved batches remain
-- unresolved and the migration aborts below.
CREATE TEMP TABLE _single_legacy_import_owner (
  id TEXT PRIMARY KEY
) ON COMMIT DROP;

INSERT INTO _single_legacy_import_owner (id)
SELECT MIN(id)
FROM "Client"
HAVING COUNT(*) = 1
   AND BOOL_AND(
     UPPER(TRIM("code")) = 'AVIAT'
     OR UPPER(TRIM("name")) = 'AVIAT'
     OR UPPER(TRIM(COALESCE("tradeName", ''))) = 'AVIAT'
     OR UPPER(TRIM(COALESCE("legalName", ''))) = 'AVIAT'
   );

UPDATE "ImportBatch"
SET "clientId" = (SELECT id FROM _single_legacy_import_owner)
WHERE "clientId" IS NULL
  AND EXISTS (SELECT 1 FROM _single_legacy_import_owner);

DO $$
DECLARE
  unresolved_n INTEGER;
  unresolved_admin_n INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO unresolved_n
  FROM "ImportBatch"
WHERE "clientId" IS NULL;

  SELECT COUNT(*)
  INTO unresolved_admin_n
  FROM "ImportBatch" b
  JOIN "User" u ON u.id = b."createdById"
  WHERE b."clientId" IS NULL
    AND u.role = 'ADMIN';

  IF unresolved_n > 0 THEN
    RAISE EXCEPTION
      'IMPORT_BATCH_CLIENT_AMBIGUOUS: % importaciones sin propietario determinista (% creadas por ADMIN).',
      unresolved_n,
      unresolved_admin_n;
  END IF;
END $$;

UPDATE "ImportBatch"
SET "clientId" = TRIM("clientId")
WHERE "clientId" IS NOT NULL;

ALTER TABLE "ImportBatch" ALTER COLUMN "clientId" SET NOT NULL;
ALTER TABLE "ImportBatch"
  ADD CONSTRAINT "ImportBatch_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "ImportBatch_clientId_idx" ON "ImportBatch"("clientId");
CREATE INDEX "ImportBatch_clientId_createdAt_idx" ON "ImportBatch"("clientId", "createdAt");
