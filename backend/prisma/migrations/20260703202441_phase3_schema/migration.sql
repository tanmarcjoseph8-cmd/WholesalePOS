-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'STORE',
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "valueType" TEXT NOT NULL DEFAULT 'json',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Setting_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReceiptSequence" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT 'POS',
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "padding" INTEGER NOT NULL DEFAULT 6,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReceiptSequence_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ReceiptPrintLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "saleId" TEXT,
    "refundId" TEXT,
    "printedById" TEXT,
    "printerName" TEXT,
    "printerType" TEXT NOT NULL DEFAULT 'WINDOWS',
    "paperWidth" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "printedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReceiptPrintLog_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReceiptPrintLog_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ReceiptPrintLog_printedById_fkey" FOREIGN KEY ("printedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HeldSale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "customerId" TEXT,
    "label" TEXT,
    "note" TEXT,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME,
    "deletedAt" DATETIME,
    CONSTRAINT "HeldSale_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HeldSale_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HeldSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HeldSaleItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "heldSaleId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HeldSaleItem_heldSaleId_fkey" FOREIGN KEY ("heldSaleId") REFERENCES "HeldSale" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "HeldSaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "customerId" TEXT,
    "originalSaleId" TEXT,
    "receiptNumber" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "subtotal" DECIMAL NOT NULL,
    "taxTotal" DECIMAL NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Refund_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Refund_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Refund_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Refund_originalSaleId_fkey" FOREIGN KEY ("originalSaleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefundItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refundId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "taxAmount" DECIMAL NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL NOT NULL,
    CONSTRAINT "RefundItem_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "RefundItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RefundPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refundId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "reference" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefundPayment_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BarcodeLabelBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdByUserId" TEXT,
    "labelType" TEXT NOT NULL,
    "paperSize" TEXT,
    "itemCount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printedAt" DATETIME,
    CONSTRAINT "BarcodeLabelBatch_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BackupRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdByUserId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "filePath" TEXT,
    "fileSizeBytes" BIGINT,
    "errorMessage" TEXT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    CONSTRAINT "BackupRun_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UploadedAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "uploadedByUserId" TEXT,
    "purpose" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "checksum" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" DATETIME,
    CONSTRAINT "UploadedAsset_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CashDrawerSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "storeId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "openingCash" DECIMAL NOT NULL DEFAULT 0,
    "closingCash" DECIMAL,
    "expectedCash" DECIMAL,
    "variance" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    CONSTRAINT "CashDrawerSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CashDrawerSession_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockAlert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "threshold" DECIMAL,
    "quantity" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    CONSTRAINT "StockAlert_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockAlert_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "categoryId" TEXT,
    "supplierId" TEXT,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "brand" TEXT,
    "inventoryUnit" TEXT NOT NULL,
    "sellingUnit" TEXT NOT NULL,
    "unitRatioToBase" DECIMAL NOT NULL DEFAULT 1,
    "packageSize" DECIMAL NOT NULL DEFAULT 1,
    "costPrice" DECIMAL NOT NULL,
    "retailPrice" DECIMAL NOT NULL,
    "wholesalePrice" DECIMAL NOT NULL,
    "vipPrice" DECIMAL NOT NULL,
    "wholesaleThreshold" DECIMAL NOT NULL DEFAULT 0,
    "taxRate" DECIMAL NOT NULL DEFAULT 0,
    "minimumStock" DECIMAL NOT NULL DEFAULT 0,
    "maximumStock" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" DATETIME,
    "batchNumber" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "deletedAt" DATETIME,
    CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Product" ("batchNumber", "brand", "categoryId", "costPrice", "createdAt", "deletedAt", "description", "expiresAt", "id", "imageUrl", "inventoryUnit", "location", "maximumStock", "minimumStock", "name", "notes", "retailPrice", "sellingUnit", "sku", "status", "supplierId", "taxRate", "unitRatioToBase", "updatedAt", "vipPrice", "wholesalePrice") SELECT "batchNumber", "brand", "categoryId", "costPrice", "createdAt", "deletedAt", "description", "expiresAt", "id", "imageUrl", "inventoryUnit", "location", "maximumStock", "minimumStock", "name", "notes", "retailPrice", "sellingUnit", "sku", "status", "supplierId", "taxRate", "unitRatioToBase", "updatedAt", "vipPrice", "wholesalePrice" FROM "Product";
DROP TABLE "Product";
ALTER TABLE "new_Product" RENAME TO "Product";
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
CREATE INDEX "Product_name_idx" ON "Product"("name");
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");
CREATE INDEX "Product_supplierId_idx" ON "Product"("supplierId");
CREATE INDEX "Product_deletedAt_idx" ON "Product"("deletedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Setting_scope_idx" ON "Setting"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_storeId_key_key" ON "Setting"("storeId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptSequence_storeId_prefix_key" ON "ReceiptSequence"("storeId", "prefix");

-- CreateIndex
CREATE INDEX "ReceiptPrintLog_saleId_printedAt_idx" ON "ReceiptPrintLog"("saleId", "printedAt");

-- CreateIndex
CREATE INDEX "ReceiptPrintLog_refundId_printedAt_idx" ON "ReceiptPrintLog"("refundId", "printedAt");

-- CreateIndex
CREATE INDEX "ReceiptPrintLog_status_printedAt_idx" ON "ReceiptPrintLog"("status", "printedAt");

-- CreateIndex
CREATE INDEX "HeldSale_storeId_updatedAt_idx" ON "HeldSale"("storeId", "updatedAt");

-- CreateIndex
CREATE INDEX "HeldSale_cashierId_updatedAt_idx" ON "HeldSale"("cashierId", "updatedAt");

-- CreateIndex
CREATE INDEX "HeldSale_deletedAt_idx" ON "HeldSale"("deletedAt");

-- CreateIndex
CREATE INDEX "HeldSaleItem_heldSaleId_idx" ON "HeldSaleItem"("heldSaleId");

-- CreateIndex
CREATE INDEX "HeldSaleItem_productId_idx" ON "HeldSaleItem"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_receiptNumber_key" ON "Refund"("receiptNumber");

-- CreateIndex
CREATE INDEX "Refund_storeId_createdAt_idx" ON "Refund"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "Refund_cashierId_createdAt_idx" ON "Refund"("cashierId", "createdAt");

-- CreateIndex
CREATE INDEX "Refund_originalSaleId_idx" ON "Refund"("originalSaleId");

-- CreateIndex
CREATE INDEX "RefundItem_refundId_idx" ON "RefundItem"("refundId");

-- CreateIndex
CREATE INDEX "RefundItem_productId_idx" ON "RefundItem"("productId");

-- CreateIndex
CREATE INDEX "RefundPayment_refundId_idx" ON "RefundPayment"("refundId");

-- CreateIndex
CREATE INDEX "BarcodeLabelBatch_createdByUserId_createdAt_idx" ON "BarcodeLabelBatch"("createdByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "BarcodeLabelBatch_status_createdAt_idx" ON "BarcodeLabelBatch"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BackupRun_type_startedAt_idx" ON "BackupRun"("type", "startedAt");

-- CreateIndex
CREATE INDEX "BackupRun_status_startedAt_idx" ON "BackupRun"("status", "startedAt");

-- CreateIndex
CREATE INDEX "UploadedAsset_purpose_createdAt_idx" ON "UploadedAsset"("purpose", "createdAt");

-- CreateIndex
CREATE INDEX "UploadedAsset_deletedAt_idx" ON "UploadedAsset"("deletedAt");

-- CreateIndex
CREATE INDEX "CashDrawerSession_storeId_openedAt_idx" ON "CashDrawerSession"("storeId", "openedAt");

-- CreateIndex
CREATE INDEX "CashDrawerSession_cashierId_openedAt_idx" ON "CashDrawerSession"("cashierId", "openedAt");

-- CreateIndex
CREATE INDEX "CashDrawerSession_status_idx" ON "CashDrawerSession"("status");

-- CreateIndex
CREATE INDEX "StockAlert_productId_status_idx" ON "StockAlert"("productId", "status");

-- CreateIndex
CREATE INDEX "StockAlert_warehouseId_status_idx" ON "StockAlert"("warehouseId", "status");

-- CreateIndex
CREATE INDEX "StockAlert_type_status_idx" ON "StockAlert"("type", "status");
