-- Epoch is bound by the referenced run. The reading-level legacy column was
-- used only while backfilling the first borrowed-device protocol migration.
BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "PdaTestReading" reading
    LEFT JOIN "PdaCaptureRun" run
      ON run."id" = reading."runId"
      AND run."sessionId" = reading."sessionId"
      AND run."clientId" = reading."clientId"
    WHERE run."id" IS NULL
  ) THEN
    RAISE EXCEPTION 'PDA_READING_RUN_BINDING_INVALID: no se eliminará epoch.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "PdaLabGrant"
    WHERE "scope" <> 'PDA_SESSION_CAPTURE_V1'
      OR "scopes" IS NULL
      OR NOT (
        "scopes" @> ARRAY['pda:run', 'pda:capture', 'pda:release']::TEXT[]
        AND "scopes" <@ ARRAY['pda:run', 'pda:capture', 'pda:release']::TEXT[]
      )
  ) THEN
    RAISE EXCEPTION 'PDA_GRANT_SCOPE_MIGRATION_INVALID: no se eliminará scopes.';
  END IF;
END $$;

ALTER TABLE "PdaTestReading" DROP COLUMN "epoch";
ALTER TABLE "PdaCaptureRun" ALTER COLUMN "epoch" DROP DEFAULT;
ALTER TABLE "PdaLabGrant" DROP COLUMN "scopes";

COMMIT;
