-- Forward-only hardening of the already-published borrowed-device protocol.
ALTER TYPE "PdaTestSessionStatus" RENAME TO "PdaSessionStatus";
ALTER TYPE "PdaCaptureRunStatus" RENAME TO "PdaRunStatus";
ALTER TYPE "PdaGrantStatus" ADD VALUE IF NOT EXISTS 'DRAIN_ONLY' BEFORE 'REVOKED';
CREATE TYPE "PdaPairingStatus" AS ENUM ('PENDING', 'CONSUMED', 'LOCKED', 'EXPIRED');
CREATE TYPE "PdaCaptureMode" AS ENUM ('CAMERA', 'HID', 'MANUAL', 'NO_LEIDO');

ALTER TABLE "PdaTestSession"
  ALTER COLUMN "version" SET DEFAULT 0,
  ADD COLUMN "captureEpoch" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "closingAt" TIMESTAMP(3),
  ADD COLUMN "incompleteRuns" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "knownMissingAttempts" INTEGER NOT NULL DEFAULT 0;

UPDATE "PdaTestSession" session
SET "incompleteRuns" = legacy.total
FROM (
  SELECT "sessionId", COUNT(*)::INTEGER AS total
  FROM "PdaCaptureRun"
  WHERE "status" = 'INCOMPLETE'
  GROUP BY "sessionId"
) legacy
WHERE session."id" = legacy."sessionId";

ALTER TABLE "PdaPairingChallenge" RENAME COLUMN "secretDigest" TO "qrSecretDigest";
ALTER TABLE "PdaPairingChallenge" RENAME COLUMN "attempts" TO "failedAttempts";
ALTER TABLE "PdaPairingChallenge"
  ADD COLUMN "manualSecretDigest" TEXT,
  ADD COLUMN "status" "PdaPairingStatus",
  ADD COLUMN "updatedAt" TIMESTAMP(3);

UPDATE "PdaPairingChallenge"
SET
  "manualSecretDigest" = 'LEGACY-DISABLED-' || "id",
  "status" = CASE
    WHEN "consumedAt" IS NOT NULL THEN 'CONSUMED'::"PdaPairingStatus"
    WHEN "failedAttempts" >= "maxAttempts" THEN 'LOCKED'::"PdaPairingStatus"
    WHEN "expiresAt" <= CURRENT_TIMESTAMP THEN 'EXPIRED'::"PdaPairingStatus"
    ELSE 'PENDING'::"PdaPairingStatus"
  END,
  "updatedAt" = "createdAt";

ALTER TABLE "PdaPairingChallenge"
  ALTER COLUMN "manualSecretDigest" SET NOT NULL,
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'PENDING',
  ALTER COLUMN "updatedAt" SET NOT NULL;

DROP INDEX "PdaPairingChallenge_secretDigest_key";
DROP INDEX "PdaPairingChallenge_clientId_sessionId_expiresAt_idx";
CREATE UNIQUE INDEX "PdaPairingChallenge_qrSecretDigest_key"
  ON "PdaPairingChallenge"("qrSecretDigest");
CREATE UNIQUE INDEX "PdaPairingChallenge_manualSecretDigest_key"
  ON "PdaPairingChallenge"("manualSecretDigest");
CREATE INDEX "PdaPairingChallenge_clientId_sessionId_status_expiresAt_idx"
  ON "PdaPairingChallenge"("clientId", "sessionId", "status", "expiresAt");

ALTER TABLE "PdaLabGrant" RENAME COLUMN "challengeId" TO "pairingId";
ALTER TABLE "PdaLabGrant"
  ADD COLUMN "scope" TEXT NOT NULL DEFAULT 'PDA_SESSION_CAPTURE_V1',
  ADD COLUMN "captureRevokedAt" TIMESTAMP(3),
  ADD COLUMN "releaseNonceDigest" TEXT,
  ADD COLUMN "releaseReceiptId" TEXT,
  ADD COLUMN "releaseConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "PdaLabGrant" SET "updatedAt" = "createdAt";
ALTER TABLE "PdaLabGrant" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "PdaLabGrant"
  RENAME CONSTRAINT "PdaLabGrant_challengeId_fkey" TO "PdaLabGrant_pairingId_fkey";
ALTER TABLE "PdaCaptureRun"
  DROP CONSTRAINT "PdaCaptureRun_grantId_clientId_fkey";
DROP INDEX "PdaLabGrant_challengeId_key";
DROP INDEX "PdaLabGrant_id_clientId_key";
DROP INDEX "PdaLabGrant_clientId_sessionId_status_idx";
CREATE UNIQUE INDEX "PdaLabGrant_pairingId_key" ON "PdaLabGrant"("pairingId");
CREATE UNIQUE INDEX "PdaLabGrant_releaseReceiptId_key" ON "PdaLabGrant"("releaseReceiptId");
CREATE UNIQUE INDEX "PdaLabGrant_id_sessionId_clientId_key"
  ON "PdaLabGrant"("id", "sessionId", "clientId");
CREATE INDEX "PdaLabGrant_clientId_sessionId_status_expiresAt_idx"
  ON "PdaLabGrant"("clientId", "sessionId", "status", "expiresAt");

ALTER TABLE "PdaCaptureRun" RENAME COLUMN "lastAcceptedSeq" TO "receivedCount";
ALTER TABLE "PdaCaptureRun" RENAME COLUMN "sealedThroughSeq" TO "sealedAtSeq";
ALTER TABLE "PdaCaptureRun"
  ADD COLUMN "clientRunKey" TEXT,
  ADD COLUMN "captureStoppedConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "localCleanupConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "legacyImported" BOOLEAN NOT NULL DEFAULT false;

UPDATE "PdaCaptureRun"
SET
  "clientRunKey" = CASE
    WHEN "grantId" IS NULL THEN 'legacy-' || "id"
    ELSE 'migrated-' || "id"
  END,
  "legacyImported" = ("grantId" IS NULL),
  "epoch" = CASE WHEN "grantId" IS NULL THEN 0 ELSE "epoch" END;

ALTER TABLE "PdaCaptureRun"
  ALTER COLUMN "clientRunKey" SET NOT NULL,
  ALTER COLUMN "version" SET DEFAULT 0,
  ALTER COLUMN "createdById" DROP NOT NULL,
  ADD CONSTRAINT "PdaCaptureRun_epoch_check" CHECK ("legacyImported" OR "epoch" > 0),
  ADD CONSTRAINT "PdaCaptureRun_sealed_seq_check" CHECK ("sealedAtSeq" IS NULL OR "sealedAtSeq" >= 0),
  ADD CONSTRAINT "PdaCaptureRun_received_check" CHECK (
    "receivedCount" >= 0 AND ("sealedAtSeq" IS NULL OR "receivedCount" <= "sealedAtSeq")
  );

ALTER TABLE "PdaTestReading"
  DROP CONSTRAINT "PdaTestReading_runId_clientId_fkey";
DROP INDEX "PdaCaptureRun_id_clientId_key";
DROP INDEX "PdaCaptureRun_sessionId_publicId_key";
DROP INDEX "PdaCaptureRun_clientId_sessionId_status_idx";
DROP INDEX "PdaCaptureRun_grantId_status_idx";
CREATE UNIQUE INDEX "PdaCaptureRun_id_sessionId_clientId_key"
  ON "PdaCaptureRun"("id", "sessionId", "clientId");
CREATE UNIQUE INDEX "PdaCaptureRun_clientId_sessionId_epoch_key"
  ON "PdaCaptureRun"("clientId", "sessionId", "epoch");
CREATE UNIQUE INDEX "PdaCaptureRun_grantId_clientRunKey_key"
  ON "PdaCaptureRun"("grantId", "clientRunKey");
CREATE UNIQUE INDEX "PdaCaptureRun_one_active_per_session"
  ON "PdaCaptureRun"("sessionId") WHERE "status" = 'ACTIVE';
CREATE INDEX "PdaCaptureRun_sessionId_status_startedAt_idx"
  ON "PdaCaptureRun"("sessionId", "status", "startedAt");
CREATE INDEX "PdaCaptureRun_clientId_createdAt_idx"
  ON "PdaCaptureRun"("clientId", "createdAt");

ALTER TABLE "PdaCaptureRun"
  ADD CONSTRAINT "PdaCaptureRun_grantId_sessionId_clientId_fkey"
    FOREIGN KEY ("grantId", "sessionId", "clientId")
    REFERENCES "PdaLabGrant"("id", "sessionId", "clientId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PdaTestReading"
  ADD COLUMN "grantId" TEXT,
  ADD COLUMN "captureMode" "PdaCaptureMode";

UPDATE "PdaTestReading"
SET "captureMode" = CASE
  WHEN "rawCode" IS NULL THEN 'NO_LEIDO'::"PdaCaptureMode"
  WHEN LOWER("captureMethod") LIKE '%cámara%'
    OR LOWER("captureMethod") LIKE '%camera%' THEN 'CAMERA'::"PdaCaptureMode"
  WHEN LOWER("captureMethod") LIKE '%scanner%'
    OR LOWER("captureMethod") LIKE '%teclado%'
    OR LOWER("captureMethod") LIKE '%hid%' THEN 'HID'::"PdaCaptureMode"
  ELSE 'MANUAL'::"PdaCaptureMode"
END;

ALTER TABLE "PdaTestReading"
  ALTER COLUMN "captureMode" SET NOT NULL,
  ADD CONSTRAINT "PdaTestReading_client_seq_check" CHECK ("clientSeq" > 0),
  ADD CONSTRAINT "PdaTestReading_metrics_check"
    CHECK (("detectionMs" IS NULL OR "detectionMs" >= 0) AND ("classificationMs" IS NULL OR "classificationMs" >= 0));

ALTER TABLE "PdaTestReading"
  ADD CONSTRAINT "PdaTestReading_runId_sessionId_clientId_fkey"
    FOREIGN KEY ("runId", "sessionId", "clientId")
    REFERENCES "PdaCaptureRun"("id", "sessionId", "clientId")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PdaTestReading_grantId_sessionId_clientId_fkey"
    FOREIGN KEY ("grantId", "sessionId", "clientId")
    REFERENCES "PdaLabGrant"("id", "sessionId", "clientId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
