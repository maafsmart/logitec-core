-- CreateEnum
CREATE TYPE "InventoryAssignmentType" AS ENUM ('PROJECT', 'FREE_TO_SALE', 'LEGACY_UNASSIGNED');

-- CreateTable
CREATE TABLE "ProductProject" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductProject_productId_projectId_key" ON "ProductProject"("productId", "projectId");

-- CreateIndex
CREATE INDEX "ProductProject_projectId_idx" ON "ProductProject"("projectId");

-- AddForeignKey
ALTER TABLE "ProductProject" ADD CONSTRAINT "ProductProject_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductProject" ADD CONSTRAINT "ProductProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable Inventory: nullable columns first
ALTER TABLE "Inventory" ADD COLUMN "assignmentType" "InventoryAssignmentType",
ADD COLUMN "projectId" TEXT,
ADD COLUMN "assignmentKey" TEXT;

-- Backfill Inventory from current Product.customerId. Never invent FREE_TO_SALE.
UPDATE "Inventory" AS i
SET
    "assignmentType" = 'PROJECT',
    "projectId" = p."customerId",
    "assignmentKey" = 'P:' || p."customerId"
FROM "Product" AS p
WHERE i."productId" = p."id"
  AND p."customerId" IS NOT NULL;

UPDATE "Inventory" AS i
SET
    "assignmentType" = 'LEGACY_UNASSIGNED',
    "projectId" = NULL,
    "assignmentKey" = 'LEGACY_UNASSIGNED'
FROM "Product" AS p
WHERE i."productId" = p."id"
  AND p."customerId" IS NULL;

UPDATE "Inventory"
SET
    "assignmentType" = 'LEGACY_UNASSIGNED',
    "projectId" = NULL,
    "assignmentKey" = 'LEGACY_UNASSIGNED'
WHERE "assignmentType" IS NULL
   OR "assignmentKey" IS NULL;

-- Not-null after backfill
ALTER TABLE "Inventory" ALTER COLUMN "assignmentType" SET NOT NULL;
ALTER TABLE "Inventory" ALTER COLUMN "assignmentKey" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Replace unique
DROP INDEX "Inventory_productId_locationId_status_key";

CREATE UNIQUE INDEX "Inventory_productId_locationId_status_assignmentKey_key" ON "Inventory"("productId", "locationId", "status", "assignmentKey");

CREATE INDEX "Inventory_projectId_idx" ON "Inventory"("projectId");

CREATE INDEX "Inventory_assignmentType_idx" ON "Inventory"("assignmentType");

CREATE INDEX "Inventory_assignmentKey_idx" ON "Inventory"("assignmentKey");

ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_assignment_coherence_check" CHECK (
    (
        "assignmentType" = 'PROJECT'
        AND "projectId" IS NOT NULL
        AND "assignmentKey" = ('P:' || "projectId")
    )
    OR (
        "assignmentType" = 'FREE_TO_SALE'
        AND "projectId" IS NULL
        AND "assignmentKey" = 'FREE_TO_SALE'
    )
    OR (
        "assignmentType" = 'LEGACY_UNASSIGNED'
        AND "projectId" IS NULL
        AND "assignmentKey" = 'LEGACY_UNASSIGNED'
    )
);

-- Backfill ProductProject from Product.customerId
INSERT INTO "ProductProject" ("id", "productId", "projectId", "active", "createdAt")
SELECT 'pp_' || p."id", p."id", p."customerId", TRUE, CURRENT_TIMESTAMP
FROM "Product" AS p
WHERE p."customerId" IS NOT NULL
ON CONFLICT ("productId", "projectId") DO NOTHING;

-- AlterTable InventoryMovement: historical snapshot fields remain NULL
ALTER TABLE "InventoryMovement" ADD COLUMN "fromAssignmentType" "InventoryAssignmentType",
ADD COLUMN "fromProjectId" TEXT,
ADD COLUMN "fromAssignmentKey" TEXT,
ADD COLUMN "toAssignmentType" "InventoryAssignmentType",
ADD COLUMN "toProjectId" TEXT,
ADD COLUMN "toAssignmentKey" TEXT;

CREATE INDEX "InventoryMovement_fromProjectId_idx" ON "InventoryMovement"("fromProjectId");

CREATE INDEX "InventoryMovement_toProjectId_idx" ON "InventoryMovement"("toProjectId");

CREATE INDEX "InventoryMovement_fromAssignmentKey_idx" ON "InventoryMovement"("fromAssignmentKey");

CREATE INDEX "InventoryMovement_toAssignmentKey_idx" ON "InventoryMovement"("toAssignmentKey");

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_fromProjectId_fkey" FOREIGN KEY ("fromProjectId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_toProjectId_fkey" FOREIGN KEY ("toProjectId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_from_assignment_check" CHECK (
    "fromAssignmentType" IS NULL
    OR (
        "fromAssignmentType" = 'PROJECT'
        AND "fromProjectId" IS NOT NULL
        AND "fromAssignmentKey" = ('P:' || "fromProjectId")
    )
    OR (
        "fromAssignmentType" = 'FREE_TO_SALE'
        AND "fromProjectId" IS NULL
        AND "fromAssignmentKey" = 'FREE_TO_SALE'
    )
    OR (
        "fromAssignmentType" = 'LEGACY_UNASSIGNED'
        AND "fromProjectId" IS NULL
        AND "fromAssignmentKey" = 'LEGACY_UNASSIGNED'
    )
);

ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_to_assignment_check" CHECK (
    "toAssignmentType" IS NULL
    OR (
        "toAssignmentType" = 'PROJECT'
        AND "toProjectId" IS NOT NULL
        AND "toAssignmentKey" = ('P:' || "toProjectId")
    )
    OR (
        "toAssignmentType" = 'FREE_TO_SALE'
        AND "toProjectId" IS NULL
        AND "toAssignmentKey" = 'FREE_TO_SALE'
    )
    OR (
        "toAssignmentType" = 'LEGACY_UNASSIGNED'
        AND "toProjectId" IS NULL
        AND "toAssignmentKey" = 'LEGACY_UNASSIGNED'
    )
);
