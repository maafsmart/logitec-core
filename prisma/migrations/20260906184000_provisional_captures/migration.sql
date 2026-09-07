-- Provisional floor captures and append-only supervisor review history
CREATE TABLE "ProvisionalCapture" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "declaredActionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "observation" TEXT,
    "readings" JSONB NOT NULL,
    "physicalStartedAt" TIMESTAMP(3) NOT NULL,
    "physicalEndedAt" TIMESTAMP(3) NOT NULL,
    "executorOperatorMode" BOOLEAN NOT NULL DEFAULT false,
    "device" TEXT,
    "projectId" TEXT,
    "reviewerId" TEXT,
    "reviewType" TEXT,
    "adminUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProvisionalCapture_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProvisionalCaptureReview" (
    "id" TEXT NOT NULL,
    "captureId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "reviewerRole" TEXT NOT NULL,
    "reviewType" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProvisionalCaptureReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProvisionalCapture_clientId_status_createdAt_idx" ON "ProvisionalCapture"("clientId", "status", "createdAt");
CREATE INDEX "ProvisionalCapture_createdById_idx" ON "ProvisionalCapture"("createdById");
CREATE INDEX "ProvisionalCapture_projectId_idx" ON "ProvisionalCapture"("projectId");
CREATE INDEX "ProvisionalCaptureReview_captureId_createdAt_idx" ON "ProvisionalCaptureReview"("captureId", "createdAt");
CREATE INDEX "ProvisionalCaptureReview_reviewerId_idx" ON "ProvisionalCaptureReview"("reviewerId");

ALTER TABLE "ProvisionalCapture" ADD CONSTRAINT "ProvisionalCapture_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProvisionalCapture" ADD CONSTRAINT "ProvisionalCapture_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProvisionalCapture" ADD CONSTRAINT "ProvisionalCapture_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProvisionalCapture" ADD CONSTRAINT "ProvisionalCapture_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProvisionalCaptureReview" ADD CONSTRAINT "ProvisionalCaptureReview_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "ProvisionalCapture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProvisionalCaptureReview" ADD CONSTRAINT "ProvisionalCaptureReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
