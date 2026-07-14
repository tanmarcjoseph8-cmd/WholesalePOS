-- Existing products and sales remain retail records through additive defaults.
ALTER TABLE "Product" ADD COLUMN "variant" TEXT;
ALTER TABLE "Product" ADD COLUMN "salesChannel" TEXT NOT NULL DEFAULT 'RETAIL';

ALTER TABLE "Sale" ADD COLUMN "orderNumber" TEXT;
ALTER TABLE "Sale" ADD COLUMN "orderType" TEXT NOT NULL DEFAULT 'RETAIL';
ALTER TABLE "Sale" ADD COLUMN "serviceCharge" DECIMAL NOT NULL DEFAULT 0;
ALTER TABLE "Sale" ADD COLUMN "tip" DECIMAL NOT NULL DEFAULT 0;

CREATE INDEX "Product_name_variant_idx" ON "Product"("name", "variant");
CREATE INDEX "Product_salesChannel_status_idx" ON "Product"("salesChannel", "status");
CREATE UNIQUE INDEX "Sale_orderNumber_key" ON "Sale"("orderNumber");
CREATE INDEX "Sale_orderType_createdAt_idx" ON "Sale"("orderType", "createdAt");

INSERT OR IGNORE INTO "Permission" ("id", "key", "description") VALUES
  ('permission-inventory-import', 'inventory.import', 'Import Inventory'),
  ('permission-inventory-import-rollback', 'inventory.import.rollback', 'Rollback Inventory Imports'),
  ('permission-tables-manage', 'tables.manage', 'Manage Tables'),
  ('permission-orders-manage', 'orders.manage', 'Manage Orders'),
  ('permission-orders-cancel', 'orders.cancel', 'Cancel Orders'),
  ('permission-orders-split-bill', 'orders.split-bill', 'Split Bills'),
  ('permission-orders-discount', 'orders.discount', 'Apply Order Discounts'),
  ('permission-orders-reopen', 'orders.reopen', 'Reopen Orders');

INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionId")
SELECT "Role"."id", "Permission"."id"
FROM "Role", "Permission"
WHERE "Role"."name" IN ('Owner', 'Administrator')
  AND "Permission"."key" IN (
    'inventory.import',
    'inventory.import.rollback',
    'tables.manage',
    'orders.manage',
    'orders.cancel',
    'orders.split-bill',
    'orders.discount',
    'orders.reopen'
  );

INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionId")
SELECT "Role"."id", "Permission"."id"
FROM "Role", "Permission"
WHERE "Role"."name" = 'Cashier'
  AND "Permission"."key" = 'orders.manage';
