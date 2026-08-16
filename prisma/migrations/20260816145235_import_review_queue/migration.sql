-- AlterTable
ALTER TABLE "ImportRow" ADD COLUMN     "corrections" JSONB,
ADD COLUMN     "ignoredAt" TIMESTAMP(3),
ADD COLUMN     "ignoredById" TEXT,
ADD COLUMN     "reviewState" TEXT NOT NULL DEFAULT 'READY',
ADD COLUMN     "validatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ImportRowAudit" (
    "id" TEXT NOT NULL,
    "importRowId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "original" JSONB,
    "previous" JSONB,
    "next" JSONB,
    "scope" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRowAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportRowAudit_importRowId_createdAt_idx" ON "ImportRowAudit"("importRowId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportRowAudit_actorId_createdAt_idx" ON "ImportRowAudit"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportRow_importBatchId_reviewState_idx" ON "ImportRow"("importBatchId", "reviewState");

-- AddForeignKey
ALTER TABLE "ImportRowAudit" ADD CONSTRAINT "ImportRowAudit_importRowId_fkey" FOREIGN KEY ("importRowId") REFERENCES "ImportRow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRowAudit" ADD CONSTRAINT "ImportRowAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
