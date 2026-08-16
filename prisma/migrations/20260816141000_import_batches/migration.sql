CREATE TABLE "ImportBatch" (
  "id" TEXT NOT NULL,
  "context" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "fileType" TEXT NOT NULL,
  "sheetName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'UPLOADED',
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "validRows" INTEGER NOT NULL DEFAULT 0,
  "invalidRows" INTEGER NOT NULL DEFAULT 0,
  "warningRows" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "metadata" JSONB,
  CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportRow" (
  "id" TEXT NOT NULL,
  "importBatchId" TEXT NOT NULL,
  "sourceRow" INTEGER NOT NULL,
  "data" JSONB NOT NULL,
  "normalized" JSONB,
  "errors" JSONB,
  "warnings" JSONB,
  "action" TEXT,
  CONSTRAINT "ImportRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImportRow_importBatchId_sourceRow_key" ON "ImportRow"("importBatchId", "sourceRow");
CREATE INDEX "ImportBatch_createdById_createdAt_idx" ON "ImportBatch"("createdById", "createdAt");
CREATE INDEX "ImportBatch_status_createdAt_idx" ON "ImportBatch"("status", "createdAt");
CREATE INDEX "ImportRow_importBatchId_idx" ON "ImportRow"("importBatchId");

ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportRow" ADD CONSTRAINT "ImportRow_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
