-- Incremental protocol for borrowed PDA devices. Existing evidence remains intact.
CREATE TYPE "PdaSessionStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED', 'INCOMPLETE');
CREATE TYPE "PdaRunStatus" AS ENUM ('ACTIVE', 'PAUSED', 'SEALED', 'DRAINING', 'RECONCILED', 'RELEASED', 'INCOMPLETE');
CREATE TYPE "PdaPairingStatus" AS ENUM ('PENDING', 'CONSUMED', 'LOCKED', 'EXPIRED');
CREATE TYPE "PdaGrantStatus" AS ENUM ('ACTIVE', 'DRAIN_ONLY', 'REVOKED', 'EXPIRED');
CREATE TYPE "PdaCaptureMode" AS ENUM ('CAMERA', 'HID', 'MANUAL', 'NO_LEIDO');

ALTER TABLE "PdaTestSession" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "PdaTestSession"
  ALTER COLUMN "status" TYPE "PdaSessionStatus"
  USING (
    CASE
      WHEN "status" = 'FINALIZED' THEN 'CLOSED'
      WHEN "status" = 'OPEN' THEN 'OPEN'
      ELSE 'INCOMPLETE'
    END
  )::"PdaSessionStatus";
ALTER TABLE "PdaTestSession" ALTER COLUMN "status" SET DEFAULT 'OPEN';
ALTER TABLE "PdaTestSession"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "captureEpoch" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "closingAt" TIMESTAMP(3),
  ADD COLUMN "incompleteRuns" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "knownMissingAttempts" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "PdaPairingChallenge" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "qrSecretDigest" TEXT NOT NULL,
  "manualSecretDigest" TEXT NOT NULL,
  "status" "PdaPairingStatus" NOT NULL DEFAULT 'PENDING',
  "failedAttempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PdaPairingChallenge_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PdaPairingChallenge_attempts_check"
    CHECK ("failedAttempts" >= 0 AND "maxAttempts" > 0 AND "failedAttempts" <= "maxAttempts")
);

CREATE TABLE "PdaLabGrant" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "pairingId" TEXT NOT NULL,
  "tokenDigest" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'PDA_SESSION_CAPTURE_V1',
  "status" "PdaGrantStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastUsedAt" TIMESTAMP(3),
  "captureRevokedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokeReason" TEXT,
  "releaseNonceDigest" TEXT,
  "releaseReceiptId" TEXT,
  "releaseConfirmedAt" TIMESTAMP(3),
  "version" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PdaLabGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PdaCaptureRun" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "grantId" TEXT,
  "clientRunKey" TEXT NOT NULL,
  "epoch" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 0,
  "status" "PdaRunStatus" NOT NULL DEFAULT 'ACTIVE',
  "sealedAtSeq" INTEGER,
  "receivedCount" INTEGER NOT NULL DEFAULT 0,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sealedAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "incompleteAt" TIMESTAMP(3),
  "incompleteReason" TEXT,
  "captureStoppedConfirmedAt" TIMESTAMP(3),
  "localCleanupConfirmedAt" TIMESTAMP(3),
  "legacyImported" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PdaCaptureRun_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PdaCaptureRun_epoch_check" CHECK ("legacyImported" OR "epoch" > 0),
  CONSTRAINT "PdaCaptureRun_sealed_seq_check" CHECK ("sealedAtSeq" IS NULL OR "sealedAtSeq" >= 0),
  CONSTRAINT "PdaCaptureRun_received_check" CHECK (
    "receivedCount" >= 0 AND ("sealedAtSeq" IS NULL OR "receivedCount" <= "sealedAtSeq")
  )
);

INSERT INTO "PdaCaptureRun" (
  "id", "publicId", "clientId", "sessionId", "clientRunKey", "epoch", "status",
  "sealedAtSeq", "receivedCount", "startedAt", "sealedAt", "releasedAt",
  "incompleteAt", "incompleteReason", "legacyImported", "createdAt", "updatedAt"
)
SELECT
  'legacy-run-' || s."id",
  'LEGACY-' || UPPER(MD5(s."clientId" || ':' || s."id")),
  s."clientId",
  s."id",
  'legacy-' || s."clientSessionKey",
  0,
  CASE WHEN s."status" = 'CLOSED' THEN 'RELEASED'::"PdaRunStatus" ELSE 'INCOMPLETE'::"PdaRunStatus" END,
  COUNT(r."id")::INTEGER,
  COUNT(r."id")::INTEGER,
  s."startedAt",
  CASE WHEN s."status" = 'CLOSED' THEN COALESCE(s."finalizedAt", s."updatedAt") ELSE NULL END,
  CASE WHEN s."status" = 'CLOSED' THEN COALESCE(s."finalizedAt", s."updatedAt") ELSE NULL END,
  CASE WHEN s."status" = 'OPEN' THEN s."updatedAt" ELSE NULL END,
  CASE WHEN s."status" = 'OPEN' THEN 'LEGACY_OPEN_STATE_UNKNOWN' ELSE NULL END,
  true,
  s."createdAt",
  s."updatedAt"
FROM "PdaTestSession" s
LEFT JOIN "PdaTestReading" r ON r."sessionId" = s."id" AND r."clientId" = s."clientId"
GROUP BY s."id";

UPDATE "PdaTestSession"
SET "incompleteRuns" = 1
WHERE "status" = 'OPEN';

ALTER TABLE "PdaTestReading"
  ADD COLUMN "runId" TEXT,
  ADD COLUMN "grantId" TEXT,
  ADD COLUMN "clientSeq" INTEGER,
  ADD COLUMN "attemptId" TEXT,
  ADD COLUMN "captureMode" "PdaCaptureMode";

WITH numbered AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "sessionId", "clientId"
      ORDER BY "observedAt", "id"
    )::INTEGER AS seq
  FROM "PdaTestReading"
)
UPDATE "PdaTestReading" reading
SET
  "runId" = 'legacy-run-' || reading."sessionId",
  "clientSeq" = numbered.seq,
  "attemptId" = reading."id",
  "captureMode" = CASE
    WHEN reading."rawCode" IS NULL THEN 'NO_LEIDO'::"PdaCaptureMode"
    WHEN LOWER(reading."captureMethod") LIKE '%cámara%'
      OR LOWER(reading."captureMethod") LIKE '%camera%' THEN 'CAMERA'::"PdaCaptureMode"
    WHEN LOWER(reading."captureMethod") LIKE '%scanner%'
      OR LOWER(reading."captureMethod") LIKE '%teclado%'
      OR LOWER(reading."captureMethod") LIKE '%hid%' THEN 'HID'::"PdaCaptureMode"
    ELSE 'MANUAL'::"PdaCaptureMode"
  END
FROM numbered
WHERE numbered."id" = reading."id";

ALTER TABLE "PdaTestReading"
  ALTER COLUMN "runId" SET NOT NULL,
  ALTER COLUMN "clientSeq" SET NOT NULL,
  ALTER COLUMN "attemptId" SET NOT NULL,
  ALTER COLUMN "captureMode" SET NOT NULL;

CREATE UNIQUE INDEX "PdaPairingChallenge_publicId_key" ON "PdaPairingChallenge"("publicId");
CREATE UNIQUE INDEX "PdaPairingChallenge_qrSecretDigest_key" ON "PdaPairingChallenge"("qrSecretDigest");
CREATE UNIQUE INDEX "PdaPairingChallenge_manualSecretDigest_key" ON "PdaPairingChallenge"("manualSecretDigest");
CREATE INDEX "PdaPairingChallenge_clientId_sessionId_status_expiresAt_idx"
  ON "PdaPairingChallenge"("clientId", "sessionId", "status", "expiresAt");

CREATE UNIQUE INDEX "PdaLabGrant_publicId_key" ON "PdaLabGrant"("publicId");
CREATE UNIQUE INDEX "PdaLabGrant_pairingId_key" ON "PdaLabGrant"("pairingId");
CREATE UNIQUE INDEX "PdaLabGrant_tokenDigest_key" ON "PdaLabGrant"("tokenDigest");
CREATE UNIQUE INDEX "PdaLabGrant_releaseReceiptId_key" ON "PdaLabGrant"("releaseReceiptId");
CREATE UNIQUE INDEX "PdaLabGrant_id_sessionId_clientId_key"
  ON "PdaLabGrant"("id", "sessionId", "clientId");
CREATE INDEX "PdaLabGrant_clientId_sessionId_status_expiresAt_idx"
  ON "PdaLabGrant"("clientId", "sessionId", "status", "expiresAt");

CREATE UNIQUE INDEX "PdaCaptureRun_publicId_key" ON "PdaCaptureRun"("publicId");
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

CREATE UNIQUE INDEX "PdaTestReading_runId_clientSeq_key"
  ON "PdaTestReading"("runId", "clientSeq");
CREATE UNIQUE INDEX "PdaTestReading_runId_attemptId_key"
  ON "PdaTestReading"("runId", "attemptId");
ALTER TABLE "PdaTestReading"
  ADD CONSTRAINT "PdaTestReading_client_seq_check" CHECK ("clientSeq" > 0),
  ADD CONSTRAINT "PdaTestReading_metrics_check"
    CHECK (("detectionMs" IS NULL OR "detectionMs" >= 0) AND ("classificationMs" IS NULL OR "classificationMs" >= 0));

ALTER TABLE "PdaPairingChallenge"
  ADD CONSTRAINT "PdaPairingChallenge_sessionId_clientId_fkey"
    FOREIGN KEY ("sessionId", "clientId") REFERENCES "PdaTestSession"("id", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PdaPairingChallenge_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PdaPairingChallenge_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PdaLabGrant"
  ADD CONSTRAINT "PdaLabGrant_sessionId_clientId_fkey"
    FOREIGN KEY ("sessionId", "clientId") REFERENCES "PdaTestSession"("id", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PdaLabGrant_pairingId_fkey"
    FOREIGN KEY ("pairingId") REFERENCES "PdaPairingChallenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PdaLabGrant_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PdaLabGrant_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PdaCaptureRun"
  ADD CONSTRAINT "PdaCaptureRun_sessionId_clientId_fkey"
    FOREIGN KEY ("sessionId", "clientId") REFERENCES "PdaTestSession"("id", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PdaCaptureRun_grantId_sessionId_clientId_fkey"
    FOREIGN KEY ("grantId", "sessionId", "clientId") REFERENCES "PdaLabGrant"("id", "sessionId", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PdaCaptureRun_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PdaTestReading"
  ADD CONSTRAINT "PdaTestReading_runId_sessionId_clientId_fkey"
    FOREIGN KEY ("runId", "sessionId", "clientId") REFERENCES "PdaCaptureRun"("id", "sessionId", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PdaTestReading_grantId_sessionId_clientId_fkey"
    FOREIGN KEY ("grantId", "sessionId", "clientId") REFERENCES "PdaLabGrant"("id", "sessionId", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE;
