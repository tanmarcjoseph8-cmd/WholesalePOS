# Database Documentation

The Prisma schema in `backend/prisma/schema.prisma` is the source of truth.

## Local Persistence

The single-device app uses SQLite by default. Prisma creates the database file at `database/wholesalepos.sqlite` during migration.

This file is the app's memory. It contains users, products, stock balances, inventory movement history, sales, receipts, settings, sessions, backups, and audit logs. Closing and reopening the app keeps the data because it is stored on disk.

Back up `database/wholesalepos.sqlite` regularly before real business use. The file is intentionally ignored by Git so private shop data is not pushed to GitHub.

## Permanent Records

- `InventoryMovement` records every stock-changing event.
- `Sale`, `SaleItem`, and `SalePayment` preserve recoverable sale history.
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
