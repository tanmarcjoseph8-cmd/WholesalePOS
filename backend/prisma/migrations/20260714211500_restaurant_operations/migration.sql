-- Restaurant tables and active orders extend the existing held-sale workflow.
CREATE TABLE "RestaurantTable" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "assignedStaffId" TEXT,
    "activeOrderId" TEXT,
    "number" TEXT NOT NULL,
    "section" TEXT NOT NULL DEFAULT 'Main',
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "guestCount" INTEGER NOT NULL DEFAULT 0,
    "occupiedAt" DATETIME,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "RestaurantTable_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RestaurantTable_assignedStaffId_fkey" FOREIGN KEY ("assignedStaffId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "RestaurantTable_activeOrderId_fkey" FOREIGN KEY ("activeOrderId") REFERENCES "HeldSale" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "Sale" ADD COLUMN "heldSaleId" TEXT REFERENCES "HeldSale" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "HeldSale" ADD COLUMN "primaryTableId" TEXT REFERENCES "RestaurantTable" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HeldSale" ADD COLUMN "lockedByUserId" TEXT REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HeldSale" ADD COLUMN "orderNumber" TEXT;
ALTER TABLE "HeldSale" ADD COLUMN "orderType" TEXT NOT NULL DEFAULT 'WALK_IN';
ALTER TABLE "HeldSale" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "HeldSale" ADD COLUMN "customerName" TEXT;
ALTER TABLE "HeldSale" ADD COLUMN "customerPhone" TEXT;
ALTER TABLE "HeldSale" ADD COLUMN "queueNumber" TEXT;
ALTER TABLE "HeldSale" ADD COLUMN "guestCount" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "HeldSale" ADD COLUMN "serviceCharge" DECIMAL NOT NULL DEFAULT 0;
ALTER TABLE "HeldSale" ADD COLUMN "tip" DECIMAL NOT NULL DEFAULT 0;
ALTER TABLE "HeldSale" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "HeldSale" ADD COLUMN "lockExpiresAt" DATETIME;
ALTER TABLE "HeldSale" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "HeldSale" ADD COLUMN "cancelReason" TEXT;
ALTER TABLE "HeldSale" ADD COLUMN "reopenedAt" DATETIME;
ALTER TABLE "HeldSale" ADD COLUMN "completedAt" DATETIME;

ALTER TABLE "HeldSaleItem" ADD COLUMN "warehouseId" TEXT;
ALTER TABLE "HeldSaleItem" ADD COLUMN "soldUnit" TEXT NOT NULL DEFAULT 'PIECE';
ALTER TABLE "HeldSaleItem" ADD COLUMN "baseQuantity" DECIMAL NOT NULL DEFAULT 1;
ALTER TABLE "HeldSaleItem" ADD COLUMN "note" TEXT;
ALTER TABLE "HeldSaleItem" ADD COLUMN "deletedAt" DATETIME;

CREATE UNIQUE INDEX "RestaurantTable_storeId_number_key" ON "RestaurantTable"("storeId", "number");
CREATE INDEX "RestaurantTable_storeId_section_status_idx" ON "RestaurantTable"("storeId", "section", "status");
CREATE INDEX "RestaurantTable_activeOrderId_idx" ON "RestaurantTable"("activeOrderId");
CREATE INDEX "RestaurantTable_assignedStaffId_idx" ON "RestaurantTable"("assignedStaffId");
CREATE INDEX "RestaurantTable_deletedAt_idx" ON "RestaurantTable"("deletedAt");

CREATE UNIQUE INDEX "Sale_heldSaleId_key" ON "Sale"("heldSaleId");
CREATE UNIQUE INDEX "HeldSale_orderNumber_key" ON "HeldSale"("orderNumber");
CREATE INDEX "HeldSale_storeId_status_updatedAt_idx" ON "HeldSale"("storeId", "status", "updatedAt");
CREATE INDEX "HeldSale_primaryTableId_idx" ON "HeldSale"("primaryTableId");
CREATE INDEX "HeldSale_lockedByUserId_lockExpiresAt_idx" ON "HeldSale"("lockedByUserId", "lockExpiresAt");
CREATE INDEX "HeldSaleItem_warehouseId_idx" ON "HeldSaleItem"("warehouseId");
CREATE INDEX "HeldSaleItem_heldSaleId_deletedAt_idx" ON "HeldSaleItem"("heldSaleId", "deletedAt");
