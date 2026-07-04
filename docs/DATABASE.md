# Database Documentation

The Prisma schema in `backend/prisma/schema.prisma` is the source of truth.

## Local Persistence

The single-device app uses SQLite by default. Prisma creates the database file at `database/wholesalepos.sqlite` during migration.

This file is the app's memory. It contains users, products, stock balances, inventory movement history, sales, receipts, settings, sessions, backups, and audit logs. Closing and reopening the app keeps the data because it is stored on disk.

Back up `database/wholesalepos.sqlite` regularly before real business use. The file is intentionally ignored by Git so private shop data is not pushed to GitHub.

## Permanent Records

- `InventoryMovement` records every stock-changing event.
- `Sale`, `SaleItem`, and `SalePayment` preserve recoverable sale history.
- `SaleItem.soldQuantity`, `SaleItem.soldUnit`, and `SaleItem.baseQuantity` preserve variable quantity sales exactly as entered and as deducted from stock.
- `AuditLog` records authentication and sensitive business actions.
- `PriceHistory` records product price changes.
- `ReceiptPrintLog` records print and reprint attempts.
- `Refund`, `RefundItem`, and `RefundPayment` preserve refund history.
- `BackupRun` records manual and automatic backup attempts.

## Phase 3 Tables

Phase 3 expands the schema with durable records for the remaining commercial POS workflows:

- `Setting` stores typed business, tax, printer, receipt, theme, GCash QR, and backup settings.
- `ReceiptSequence` stores receipt numbering state per store and prefix.
- `ReceiptPrintLog` stores receipt print attempts and failures.
- `HeldSale` and `HeldSaleItem` store suspended POS carts.
- `Refund`, `RefundItem`, and `RefundPayment` store recoverable refund records.
- `BarcodeLabelBatch` stores generated barcode label print batches.
- `BackupRun` stores manual and automatic backup history.
- `UploadedAsset` stores local image, QR, receipt, and backup-related asset metadata.
- `CashDrawerSession` stores cashier opening and closing cash counts.
- `StockAlert` stores generated low-stock and out-of-stock alert states.

`Product` now includes `packageSize` and `wholesaleThreshold` so later POS phases can support partial quantity selling and automatic wholesale pricing.

## Soft Deletes

Operational entities include `deletedAt` and are filtered at the service layer.

## Inventory Safety

Stock-changing service methods must run inside database transactions and write both the balance update and the permanent movement row together.

Current inventory endpoints follow this rule by updating `InventoryStock`, inserting `InventoryMovement`, and recording `AuditLog` in one transaction for stock movements, cycle counts, and transfers.

## Variable Quantity Selling

Products can define a package size and stock unit. Sales can be entered in compatible smaller units, such as grams for kilogram products, milliliters for liter products, and centimeters for meter products.

Example: a 5kg rice sack priced at ₱300 has a package size of `5` and inventory unit `KILOGRAM`. Selling `2500` `GRAM` stores the cashier-entered quantity, converts the stock deduction to `2.5` `KILOGRAM`, and records the permanent sale item plus inventory movement in the same transaction.

## Receipts and Printing

Receipt numbers are generated from `ReceiptSequence` and saved on `Sale.receiptNumber`. The receipt module builds receipt text, HTML, barcode data, and ESC/POS command payloads directly from saved sale records so receipts can be regenerated later.

Every print request inserts `ReceiptPrintLog` with the sale, user, printer type, printer name, paper width, status, and timestamp. This keeps a permanent record of receipt printing and reprinting without deleting historical sales.

## Reports

Reports are generated from saved operational tables rather than copied into separate summary tables. Sales reports use `Sale`, `SaleItem`, and `SalePayment`; profit reports combine sale revenue with `Product.costPrice` and package size; inventory reports use `InventoryStock` and product stock thresholds.

This keeps daily, weekly, monthly, and exported reports recoverable from the same permanent business records.

## Settings and Backups

Business, tax, receipt, printer, theme, and backup preferences are saved in `Setting` rows as JSON values scoped to the store.

Manual backups copy the SQLite database file into the managed backup folder beside the live database and record the result in `BackupRun`. Restore uses an existing completed backup record, writes a pre-restore safety copy, replaces the live database file, audits the restore, and requires the app to be restarted so Prisma reconnects to the restored data.
