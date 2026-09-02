-- Preserve the published evidence migration and narrow testId uniqueness by tenant.
CREATE UNIQUE INDEX "PdaTestSession_clientId_testId_key"
ON "PdaTestSession"("clientId", "testId");

DROP INDEX IF EXISTS "PdaTestSession_testId_key";
