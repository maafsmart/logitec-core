-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN     "requisitionLineId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "requisitionId" TEXT;

-- CreateTable
CREATE TABLE "Requisition" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "reference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Requisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequisitionLine" (
    "id" TEXT NOT NULL,
    "requisitionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "requestedQty" DECIMAL(18,4) NOT NULL,
    "fulfilledQty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequisitionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" TEXT NOT NULL,
    "requisitionLineId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "inventoryLayerId" TEXT,
    "qty" DECIMAL(18,4) NOT NULL,
    "consumedQty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "releasedQty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Requisition_number_key" ON "Requisition"("number");

-- CreateIndex
CREATE INDEX "Requisition_projectId_createdAt_idx" ON "Requisition"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Requisition_status_createdAt_idx" ON "Requisition"("status", "createdAt");

-- CreateIndex
CREATE INDEX "RequisitionLine_requisitionId_idx" ON "RequisitionLine"("requisitionId");

-- CreateIndex
CREATE INDEX "RequisitionLine_productId_idx" ON "RequisitionLine"("productId");

-- CreateIndex
CREATE INDEX "InventoryReservation_requisitionLineId_status_idx" ON "InventoryReservation"("requisitionLineId", "status");

-- CreateIndex
CREATE INDEX "InventoryReservation_inventoryId_status_idx" ON "InventoryReservation"("inventoryId", "status");

-- CreateIndex
CREATE INDEX "InventoryReservation_inventoryLayerId_status_idx" ON "InventoryReservation"("inventoryLayerId", "status");

-- CreateIndex
CREATE INDEX "InventoryMovement_requisitionLineId_idx" ON "InventoryMovement"("requisitionLineId");

-- CreateIndex
CREATE INDEX "Task_requisitionId_idx" ON "Task"("requisitionId");

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_requisitionLineId_fkey" FOREIGN KEY ("requisitionLineId") REFERENCES "RequisitionLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Requisition" ADD CONSTRAINT "Requisition_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionLine" ADD CONSTRAINT "RequisitionLine_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequisitionLine" ADD CONSTRAINT "RequisitionLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_requisitionLineId_fkey" FOREIGN KEY ("requisitionLineId") REFERENCES "RequisitionLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_inventoryLayerId_fkey" FOREIGN KEY ("inventoryLayerId") REFERENCES "InventoryLayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_requisitionId_fkey" FOREIGN KEY ("requisitionId") REFERENCES "Requisition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
