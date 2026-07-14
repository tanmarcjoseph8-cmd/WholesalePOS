CREATE TABLE "InventoryImportBatch" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "rolledBackByUserId" TEXT,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PROCESSING',
  "sourceName" TEXT NOT NULL,
  "sourceSizeBytes" INTEGER,
  "fingerprint" TEXT NOT NULL,
  "rowCount" INTEGER NOT NULL,
  "validCount" INTEGER NOT NULL DEFAULT 0,
  "warningCount" INTEGER NOT NULL DEFAULT 0,
  "invalidCount" INTEGER NOT NULL DEFAULT 0,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "stockDelta" DECIMAL NOT NULL DEFAULT 0,
  "durationMs" INTEGER,
  "summary" JSONB,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" DATETIME,
  "rolledBackAt" DATETIME,
  CONSTRAINT "InventoryImportBatch_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryImportBatch_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryImportBatch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryImportBatch_rolledBackByUserId_fkey" FOREIGN KEY ("rolledBackByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "InventoryImportRow" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "batchId" TEXT NOT NULL,
  "rowNumber" INTEGER NOT NULL,
  "productId" TEXT,
  "inventoryMovementId" TEXT,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "matchMethod" TEXT,
  "previousProduct" JSONB,
  "newProduct" JSONB,
  "previousStock" DECIMAL,
  "newStock" DECIMAL,
  "quantityChanged" DECIMAL,
  "warnings" JSONB,
  "errors" JSONB,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "InventoryImportBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryImportRow_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "InventoryImportRow_inventoryMovementId_fkey" FOREIGN KEY ("inventoryMovementId") REFERENCES "InventoryMovement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "InventoryImportPreset" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "storeId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "mapping" JSONB NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  "deletedAt" DATETIME,
  CONSTRAINT "InventoryImportPreset_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryImportPreset_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "InventoryImportBatch_storeId_createdAt_idx" ON "InventoryImportBatch"("storeId", "createdAt");
CREATE INDEX "InventoryImportBatch_storeId_fingerprint_idx" ON "InventoryImportBatch"("storeId", "fingerprint");
CREATE INDEX "InventoryImportBatch_status_createdAt_idx" ON "InventoryImportBatch"("status", "createdAt");
CREATE INDEX "InventoryImportBatch_warehouseId_createdAt_idx" ON "InventoryImportBatch"("warehouseId", "createdAt");
CREATE UNIQUE INDEX "InventoryImportRow_inventoryMovementId_key" ON "InventoryImportRow"("inventoryMovementId");
CREATE UNIQUE INDEX "InventoryImportRow_batchId_rowNumber_key" ON "InventoryImportRow"("batchId", "rowNumber");
CREATE INDEX "InventoryImportRow_productId_createdAt_idx" ON "InventoryImportRow"("productId", "createdAt");
CREATE INDEX "InventoryImportRow_status_createdAt_idx" ON "InventoryImportRow"("status", "createdAt");
CREATE INDEX "InventoryImportPreset_storeId_deletedAt_idx" ON "InventoryImportPreset"("storeId", "deletedAt");
CREATE INDEX "InventoryImportPreset_createdByUserId_createdAt_idx" ON "InventoryImportPreset"("createdByUserId", "createdAt");
