-- Epoch is bound by the referenced run. The reading-level legacy column was
-- used only while backfilling the first borrowed-device protocol migration.
ALTER TABLE "PdaTestReading" DROP COLUMN "epoch";
