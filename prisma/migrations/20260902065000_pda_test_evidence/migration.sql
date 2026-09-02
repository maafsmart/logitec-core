-- PDA laboratory evidence is isolated from operational ScanEvent and inventory tables.
CREATE TABLE "PdaTestSession" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "clientSessionKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "deviceType" TEXT,
    "deviceBrand" TEXT,
    "deviceModel" TEXT,
    "deviceOs" TEXT,
    "readerType" TEXT,
    "userAgent" TEXT,
    "appVersion" TEXT,
    "deviceMetadata" JSONB,
    "totalReadings" INTEGER NOT NULL DEFAULT 0,
    "okReadings" INTEGER NOT NULL DEFAULT 0,
    "notFoundReadings" INTEGER NOT NULL DEFAULT 0,
    "failedReadings" INTEGER NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION,
    "detectionMinMs" INTEGER,
    "detectionMedianMs" INTEGER,
    "detectionP95Ms" INTEGER,
    "classificationMinMs" INTEGER,
    "classificationMedianMs" INTEGER,
    "classificationP95Ms" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "PdaTestSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PdaTestReading" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestFingerprint" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "rawCode" TEXT,
    "normalizedCode" TEXT,
    "expectedType" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "captureMethod" TEXT NOT NULL,
    "physicalZone" TEXT NOT NULL,
    "distance" TEXT,
    "detectionMs" INTEGER,
    "classificationMs" INTEGER,
    "notes" TEXT,
    "networkMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "PdaTestReading_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PdaTestSession_testId_key" ON "PdaTestSession"("testId");
CREATE UNIQUE INDEX "PdaTestSession_clientId_clientSessionKey_key" ON "PdaTestSession"("clientId", "clientSessionKey");
CREATE UNIQUE INDEX "PdaTestSession_id_clientId_key" ON "PdaTestSession"("id", "clientId");
CREATE INDEX "PdaTestSession_clientId_createdAt_idx" ON "PdaTestSession"("clientId", "createdAt");
CREATE INDEX "PdaTestSession_clientId_status_createdAt_idx" ON "PdaTestSession"("clientId", "status", "createdAt");
CREATE UNIQUE INDEX "PdaTestReading_clientId_idempotencyKey_key" ON "PdaTestReading"("clientId", "idempotencyKey");
CREATE INDEX "PdaTestReading_sessionId_observedAt_idx" ON "PdaTestReading"("sessionId", "observedAt");
CREATE INDEX "PdaTestReading_clientId_observedAt_idx" ON "PdaTestReading"("clientId", "observedAt");
CREATE INDEX "PdaTestReading_clientId_result_observedAt_idx" ON "PdaTestReading"("clientId", "result", "observedAt");

ALTER TABLE "PdaTestSession"
ADD CONSTRAINT "PdaTestSession_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PdaTestSession"
ADD CONSTRAINT "PdaTestSession_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PdaTestReading"
ADD CONSTRAINT "PdaTestReading_sessionId_clientId_fkey"
FOREIGN KEY ("sessionId", "clientId") REFERENCES "PdaTestSession"("id", "clientId") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PdaTestReading"
ADD CONSTRAINT "PdaTestReading_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PdaTestReading"
ADD CONSTRAINT "PdaTestReading_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
