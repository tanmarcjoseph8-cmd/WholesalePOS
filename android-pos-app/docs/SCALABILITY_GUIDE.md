# Scalability and Operations Guide

## Supported Design

Suki Sync 0.8.0 keeps one local SQLite database as the source of truth. It is
designed for catalogs up to 100,000 unique products, a permanent movement ledger,
and long-lived sales history. Stock quantity is an integer fixed-point value, so
large piece counts do not create one database row per physical piece.

The catalog, inventory, restaurant menu, and sales history use bounded keyset
pages. Search is debounced, barcode matching is exact and indexed, and active
stock is read from `inventory_stock`. Reports aggregate in SQLite and return only
the latest 500 transaction-detail rows while totals remain exact for the range.

## Large Imports

CSV, XLS, and XLSX imports accept up to 100,000 rows. Validation detects duplicate
SKU and barcode values before writing. The import then:

1. creates a permanent import-batch record;
2. processes 250-row indexed chunks;
3. sends each chunk through one native database bridge batch;
4. commits all product, stock, movement, and audit changes atomically;
5. rolls back the complete data change on error or cancellation;
6. records the final completed, failed, or cancelled result.

Use CSV for the lowest memory overhead on older tablets. Close other apps, keep
the tablet powered, and make a full backup first. A 100,000-row XLSX workbook is
still parsed in the WebView and therefore needs physical-device memory testing.

## Images and Prices

Product photos are resized to a maximum 1600-pixel image plus a 256-pixel
thumbnail. Files live in app-private storage; SQLite stores only paths and
metadata. POS images are lazy-loaded. Replaced image files are retained until a
future maintenance cleanup so a database rollback cannot leave a broken product.

Retail and wholesale columns remain the backwards-compatible fallback. Effective
dated rules can be added for Retail, Wholesale, and Distributor levels from the
price button in Inventory. Completed sale items retain their original unit price.

## Database Maintenance

Settings shows schema version, approximate database size, free pages, and quick
health status. **Optimize database** runs `PRAGMA optimize` to refresh planner
statistics. It does not delete sales, products, movements, or audit history.

Create full backups regularly. Keep at least two known-good backups outside the
tablet. Never use Factory Reset as database maintenance.

## Physical Device Verification

Run this checklist with production-like data:

- cold start and login on Fire OS 7/API 28;
- exact USB/Bluetooth barcode scan at 1k, 10k, 50k, and 100k products;
- search, scroll, and load-more behavior in POS and Inventory;
- 10k-row CSV import, followed by 50k and 100k on capable hardware;
- cancel an import and verify no partial product or stock changes;
- edit a product and verify historical receipt prices are unchanged;
- complete, refund, void, and reprint sales while stock remains accurate;
- daily, monthly, and custom reports with 500k sales;
- low-memory relaunch and Android process termination recovery;
- backup, uninstall/reinstall in a test environment, and restore;
- product images after restart and after backup restore;
- database health check and Optimize database operation.

Record device model, Android/Fire OS version, free storage, elapsed times, and any
crash or application-not-responding event. Desktop benchmark results alone are not
release acceptance.

## Recovery and Rollback

Migration 9 is additive and runs inside the existing migration transaction. Take
a 0.7.0 backup before upgrading. If migration or startup fails, do not clear app
storage. Preserve the device database and logs, reinstall 0.8.0, and retry. To
return to 0.7.0, restore the pre-upgrade backup into a 0.7.0 test installation;
older binaries are not expected to understand the new price/image tables.

