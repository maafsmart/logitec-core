-- Forward-only borrowed-device protocol for PDA evidence.
CREATE TYPE "PdaTestSessionStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED', 'INCOMPLETE');
CREATE TYPE "PdaCaptureRunStatus" AS ENUM ('ACTIVE', 'PAUSED', 'SEALED', 'DRAINING', 'RECONCILED', 'RELEASED', 'INCOMPLETE');
CREATE TYPE "PdaGrantStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

ALTER TABLE "PdaTestSession"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "PdaTestSessionStatus"
    USING (CASE WHEN "status" = 'FINALIZED' THEN 'CLOSED' ELSE "status" END)::"PdaTestSessionStatus",
  ALTER COLUMN "status" SET DEFAULT 'OPEN';

CREATE TABLE "PdaPairingChallenge" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "secretDigest" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 5,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "PdaPairingChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PdaLabGrant" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "tokenDigest" TEXT NOT NULL,
  "status" "PdaGrantStatus" NOT NULL DEFAULT 'ACTIVE',
  "scopes" TEXT[],
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokeReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "challengeId" TEXT NOT NULL,
  CONSTRAINT "PdaLabGrant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PdaCaptureRun" (
  "id" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "grantId" TEXT,
  "status" "PdaCaptureRunStatus" NOT NULL DEFAULT 'ACTIVE',
  "epoch" INTEGER NOT NULL DEFAULT 1,
  "version" INTEGER NOT NULL DEFAULT 1,
  "lastAcceptedSeq" INTEGER NOT NULL DEFAULT 0,
  "sealedThroughSeq" INTEGER,
  "deviceType" TEXT,
  "deviceBrand" TEXT,
  "deviceModel" TEXT,
  "deviceOs" TEXT,
  "readerType" TEXT,
  "userAgent" TEXT,
  "deviceMetadata" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pausedAt" TIMESTAMP(3),
  "sealedAt" TIMESTAMP(3),
  "reconciledAt" TIMESTAMP(3),
  "releasedAt" TIMESTAMP(3),
  "incompleteAt" TIMESTAMP(3),
  "incompleteReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "PdaCaptureRun_pkey" PRIMARY KEY ("id")
);

-- Preserve prototype evidence by assigning every legacy session one terminal legacy run.
INSERT INTO "PdaCaptureRun" (
  "id", "publicId", "clientId", "sessionId", "status", "sealedThroughSeq",
  "deviceType", "deviceBrand", "deviceModel", "deviceOs", "readerType", "userAgent",
  "deviceMetadata", "startedAt", "sealedAt", "reconciledAt", "releasedAt",
  "createdAt", "updatedAt", "createdById"
)
SELECT
  'legacy-' || s."id", 'LEGACY-' || s."id", s."clientId", s."id",
  CASE WHEN s."status" = 'CLOSED' THEN 'RELEASED'::"PdaCaptureRunStatus" ELSE 'INCOMPLETE'::"PdaCaptureRunStatus" END,
  (SELECT COUNT(*)::INTEGER FROM "PdaTestReading" r WHERE r."sessionId" = s."id"),
  s."deviceType", s."deviceBrand", s."deviceModel", s."deviceOs", s."readerType",
  s."userAgent", s."deviceMetadata", s."startedAt",
  CASE WHEN s."status" = 'CLOSED' THEN s."finalizedAt" END,
  CASE WHEN s."status" = 'CLOSED' THEN s."finalizedAt" END,
  CASE WHEN s."status" = 'CLOSED' THEN s."finalizedAt" END,
  s."createdAt", s."updatedAt", s."createdById"
FROM "PdaTestSession" s;

ALTER TABLE "PdaTestReading"
  ADD COLUMN "runId" TEXT,
  ADD COLUMN "clientSeq" INTEGER,
  ADD COLUMN "epoch" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "attemptId" TEXT;

WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "sessionId" ORDER BY "observedAt", "id")::INTEGER AS seq
  FROM "PdaTestReading"
)
UPDATE "PdaTestReading" r
SET "runId" = 'legacy-' || r."sessionId",
    "clientSeq" = numbered.seq,
    "attemptId" = r."idempotencyKey"
FROM numbered
WHERE numbered."id" = r."id";

ALTER TABLE "PdaTestReading"
  ALTER COLUMN "runId" SET NOT NULL,
  ALTER COLUMN "clientSeq" SET NOT NULL,
  ALTER COLUMN "attemptId" SET NOT NULL;

UPDATE "PdaCaptureRun" run
SET "lastAcceptedSeq" = counts.total
FROM (
  SELECT "runId", COUNT(*)::INTEGER AS total
  FROM "PdaTestReading"
  GROUP BY "runId"
) counts
WHERE run."id" = counts."runId";

CREATE UNIQUE INDEX "PdaPairingChallenge_publicId_key" ON "PdaPairingChallenge"("publicId");
CREATE UNIQUE INDEX "PdaPairingChallenge_secretDigest_key" ON "PdaPairingChallenge"("secretDigest");
CREATE INDEX "PdaPairingChallenge_clientId_sessionId_expiresAt_idx" ON "PdaPairingChallenge"("clientId", "sessionId", "expiresAt");
CREATE UNIQUE INDEX "PdaLabGrant_publicId_key" ON "PdaLabGrant"("publicId");
CREATE UNIQUE INDEX "PdaLabGrant_tokenDigest_key" ON "PdaLabGrant"("tokenDigest");
CREATE UNIQUE INDEX "PdaLabGrant_challengeId_key" ON "PdaLabGrant"("challengeId");
CREATE UNIQUE INDEX "PdaLabGrant_id_clientId_key" ON "PdaLabGrant"("id", "clientId");
CREATE INDEX "PdaLabGrant_clientId_sessionId_status_idx" ON "PdaLabGrant"("clientId", "sessionId", "status");
CREATE INDEX "PdaLabGrant_expiresAt_idx" ON "PdaLabGrant"("expiresAt");
CREATE UNIQUE INDEX "PdaCaptureRun_publicId_key" ON "PdaCaptureRun"("publicId");
CREATE UNIQUE INDEX "PdaCaptureRun_id_clientId_key" ON "PdaCaptureRun"("id", "clientId");
CREATE UNIQUE INDEX "PdaCaptureRun_sessionId_publicId_key" ON "PdaCaptureRun"("sessionId", "publicId");
CREATE INDEX "PdaCaptureRun_clientId_sessionId_status_idx" ON "PdaCaptureRun"("clientId", "sessionId", "status");
CREATE INDEX "PdaCaptureRun_grantId_status_idx" ON "PdaCaptureRun"("grantId", "status");
CREATE UNIQUE INDEX "PdaTestReading_runId_clientSeq_key" ON "PdaTestReading"("runId", "clientSeq");
CREATE UNIQUE INDEX "PdaTestReading_runId_attemptId_key" ON "PdaTestReading"("runId", "attemptId");
CREATE INDEX "PdaTestReading_runId_observedAt_idx" ON "PdaTestReading"("runId", "observedAt");

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
  ADD CONSTRAINT "PdaLabGrant_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PdaLabGrant_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PdaLabGrant_challengeId_fkey"
  FOREIGN KEY ("challengeId") REFERENCES "PdaPairingChallenge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PdaCaptureRun"
  ADD CONSTRAINT "PdaCaptureRun_sessionId_clientId_fkey"
  FOREIGN KEY ("sessionId", "clientId") REFERENCES "PdaTestSession"("id", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PdaCaptureRun_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PdaCaptureRun_grantId_clientId_fkey"
  FOREIGN KEY ("grantId", "clientId") REFERENCES "PdaLabGrant"("id", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "PdaCaptureRun_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PdaTestReading"
  ADD CONSTRAINT "PdaTestReading_runId_clientId_fkey"
  FOREIGN KEY ("runId", "clientId") REFERENCES "PdaCaptureRun"("id", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE;
