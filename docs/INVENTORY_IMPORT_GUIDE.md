# Inventory Import Guide

## Input Sources

Open Inventory and locate Advanced Inventory Import.

- Excel / CSV accepts .xlsx, .xls, and .csv files without requiring Microsoft Excel.
- Paste Rows accepts tab-separated rows copied from Excel or Google Sheets. Include the header row.
- Manual Grid starts an editable spreadsheet with common product and stock columns.
- Template downloads the complete supported-column workbook.
- Export downloads up to 1,000 current products with Product IDs for deterministic editing and re-import.

## Import Modes

- Add New Products creates new products and skips existing matches. Starting stock is recorded for created products.
- Update Existing Products changes details for matched products and leaves stock unchanged.
- Add and Update Products creates new products and updates explicit matches.
- Add Stock adds the imported quantity to current stock.
- Replace Stock sets the current balance to the imported quantity.
- Stock Adjustment applies a signed positive or negative difference.
- Initial Inventory creates or updates products and sets opening stock.

## Matching

The backend matches in this order:

1. Product ID
2. Exact SKU
3. Exact barcode
4. Exact normalized product name and variant
5. Exact normalized product name

Product ID, SKU, or barcode conflicts are invalid. Duplicate SKUs and barcodes inside one spreadsheet are invalid. Two rows cannot change the same matched product in one batch. Name-only matches remain warnings and require manual review unless Skip, Update, or Merge was explicitly selected.

## Preview

Preview does not change the database. Each row is marked Valid, Warning, or Invalid and assigned Create, Update, Stock, Skip, Review, or Invalid.

Correct cells directly in the grid and preview again. The confirmation fingerprint changes whenever mapped data, mode, warehouse, or source content changes.

## Confirmation

Continue opens a final count of products created, products updated, stock changed, and rows skipped. Confirm Import is disabled while a request is already running.

The backend revalidates everything. Valid rows are executed in transaction batches using the batch size in Settings. Each stock change creates an InventoryMovement and audit record.

## Duplicate Protection

With Prevent Duplicate Files enabled in Settings, a completed batch with the same normalized content, warehouse, mode, and source fingerprint cannot run again. The original batch is shown in preview.

## History And Reports

Import History records source file, mode, warehouse, user, date, duration, counts, stock difference, and status. Details list each row's before and after stock with warnings and errors. The download action exports the permanent row report as CSV.

## Safe Rollback

Rollback creates inverse inventory movements and never erases history. New products are soft-deleted and updated products are restored from saved snapshots.

Rollback is refused when:

- A later stock movement exists for an affected product and warehouse.
- An imported or updated product changed after import.
- A newly created product is used by a sale, held sale, refund, or purchase order.
- Current stock no longer equals the imported balance.

Create a database backup before unusually large first-time imports.

## Current Limitation

Private Google Sheets URLs are not fetched directly because that would require account authorization and network access. Copy and paste from Google Sheets is supported and works offline after the rows are loaded.
