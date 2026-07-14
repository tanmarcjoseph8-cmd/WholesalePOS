CREATE TABLE "InventoryReservation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "heldSaleId" TEXT NOT NULL,
    "heldSaleItemId" TEXT,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "releasedAt" DATETIME,
    "consumedAt" DATETIME,
    CONSTRAINT "InventoryReservation_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryReservation_heldSaleId_fkey" FOREIGN KEY ("heldSaleId") REFERENCES "HeldSale" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryReservation_heldSaleItemId_fkey" FOREIGN KEY ("heldSaleItemId") REFERENCES "HeldSaleItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "InventoryReservation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "InventoryReservation_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "InventoryReservation_heldSaleId_status_idx" ON "InventoryReservation"("heldSaleId", "status");
CREATE INDEX "InventoryReservation_heldSaleItemId_idx" ON "InventoryReservation"("heldSaleItemId");
CREATE INDEX "InventoryReservation_productId_warehouseId_status_idx" ON "InventoryReservation"("productId", "warehouseId", "status");
CREATE INDEX "InventoryReservation_storeId_status_createdAt_idx" ON "InventoryReservation"("storeId", "status", "createdAt");

ALTER TABLE "HeldSale" ADD COLUMN "mergedIntoOrderId" TEXT REFERENCES "HeldSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HeldSale" ADD COLUMN "splitFromOrderId" TEXT REFERENCES "HeldSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "HeldSale_mergedIntoOrderId_idx" ON "HeldSale"("mergedIntoOrderId");
CREATE INDEX "HeldSale_splitFromOrderId_idx" ON "HeldSale"("splitFromOrderId");

ALTER TABLE "SaleItem" ADD COLUMN "warehouseId" TEXT REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "SaleItem_warehouseId_idx" ON "SaleItem"("warehouseId");

ALTER TABLE "Refund" ADD COLUMN "requestKey" TEXT;
ALTER TABLE "Refund" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'REFUND';
CREATE UNIQUE INDEX "Refund_requestKey_key" ON "Refund"("requestKey");

ALTER TABLE "RefundItem" ADD COLUMN "saleItemId" TEXT REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefundItem" ADD COLUMN "warehouseId" TEXT REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefundItem" ADD COLUMN "inventoryMovementId" TEXT REFERENCES "InventoryMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RefundItem" ADD COLUMN "soldQuantity" DECIMAL NOT NULL DEFAULT 1;
ALTER TABLE "RefundItem" ADD COLUMN "baseQuantity" DECIMAL NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX "RefundItem_inventoryMovementId_key" ON "RefundItem"("inventoryMovementId");
CREATE INDEX "RefundItem_saleItemId_idx" ON "RefundItem"("saleItemId");
CREATE INDEX "RefundItem_warehouseId_idx" ON "RefundItem"("warehouseId");

INSERT OR IGNORE INTO "Permission" ("id", "key", "description") VALUES
  ('permission-sales-refund', 'sales.refund', 'Process partial and full refunds'),
  ('permission-sales-void', 'sales.void', 'Void completed sales and restore stock');

INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionId")
SELECT "Role"."id", "Permission"."id"
FROM "Role", "Permission"
WHERE "Role"."name" IN ('Owner', 'Administrator')
  AND "Permission"."key" IN ('sales.refund', 'sales.void');

ALTER TABLE "Sale" ADD COLUMN "customOrderType" TEXT;
ALTER TABLE "HeldSale" ADD COLUMN "customOrderType" TEXT;
