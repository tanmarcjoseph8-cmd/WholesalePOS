# Scalability Audit

Audit date: 18 July 2026. Scope: the independent Suki Sync Android edition.
No production data was opened, reset, reseeded, or modified during this audit.

## Current Architecture

- Database: on-device SQLite through `@capacitor-community/sqlite`, with foreign
  keys, WAL journaling, full synchronous durability, and a 5-second busy timeout.
- Data access: typed TypeScript services issue parameterized SQL directly. There
  is no ORM and no network or server dependency.
- Products: one `products` row per catalog item, a unique SKU, a separate unique
  `product_barcodes` table, category link, units, retail/wholesale prices, tax,
  low-stock threshold, status, timestamps, and soft deletion.
- Inventory: `inventory_stock` is the maintained current balance and
  `inventory_movements` is the permanent ledger. Active restaurant reservations
  are subtracted by the `available_inventory` view.
- Sales: immutable sale-item unit prices preserve historical receipts. Sales,
  items, payments, stock balances, movements, reservations, and drawer entries
  are committed in one transaction with idempotent request keys.
- Search: a joined catalog query searches name, SKU, and barcode with leading
  wildcards, groups stock, sorts by name, and returns at most 2,000 rows.
- Imports: CSV/XLS/XLSX is parsed in the renderer, limited to 5,000 rows, then
  imported using per-row lookup and write calls inside one transaction.
- Images: no product-image schema, local image service, thumbnails, or product
  image UI currently exists. Existing business data therefore has no image
  migration requirement.
- UI: Inventory and POS render every returned product. Sales History loads up to
  1,000 sales and filters them in memory. No catalog or sales pagination or list
  virtualization is present.

## Already Implemented Correctly

- Parameterized SQL, foreign keys, uniqueness constraints, soft deletion, and
  ordered non-destructive migrations protect data integrity.
- Current stock is not recalculated from the movement ledger for ordinary
  product screens.
- Sale completion, refund/void restoration, manual stock movement, and
  restaurant reservation changes use transactions.
- Request keys prevent duplicate sale, refund, order, and cash-drawer writes.
- Existing indexes cover unique SKU/barcode, movement product/date, sale date
  and status/date, sale-item joins, order status/table, reservation stock, and
  audit entity/action patterns.
- Reports use database aggregation and mobile reports already accept bounded
  date ranges rather than loading all lifetime data by default.

## Confirmed Performance Problems

- Empty catalog searches load and render up to 2,000 rows at once. Catalogs over
  2,000 cannot be completely browsed from the current Inventory select/list.
- Exact barcode scans use the general wildcard catalog query instead of a small,
  exact indexed lookup.
- Leading-wildcard name/SKU/barcode predicates cannot use ordinary B-tree prefix
  indexes efficiently at 100,000 products.
- Catalog stock aggregation joins and groups the inventory view for every result
  even when the caller only needs a small search result.
- Sales History loads 1,000 rows, then searches in JavaScript; it has no database
  paging, date, status, payment, or receipt filters.
- Product import performs multiple native bridge round trips per row and keeps
  one potentially long transaction open. The 5,000-row cap does not meet the
  requested 100,000-row target.
- Some report filters use `substr(created_at, 1, 10)`, preventing the existing
  sale-date index from serving the range efficiently.
- Product exports and inventory reports materialize the complete result in
  renderer memory.
- Product images and multiple extensible price levels are not implemented.

## Potential Future Bottlenecks

- Full-catalog alert reconciliation is set-based, but still touches every active
  product and warehouse after startup and inventory mutations.
- The `available_inventory` view groups reservations at query time. Its existing
  indexes help, but query plans and latency must be measured at target scale.
- Capacitor SQLite calls cross the JavaScript/native bridge; many tiny calls are
  substantially more expensive than native batch execution.
- Very large XLSX parsing remains memory intensive on low-spec Fire OS tablets,
  even after database writes are batched.
- Report/PDF creation for unusually broad date ranges can still create large
  in-memory objects and should remain explicitly date bounded.

## Required Changes

- Add non-destructive indexes tied to actual catalog, barcode, movement, sales,
  payment, and order query patterns.
- Split exact barcode lookup from text search and normalize barcode values.
- Add stable database pagination, bounded page sizes, category/status filters,
  debouncing, stale-request protection, incremental loading, and bounded UI
  rendering for products and sales.
- Replace per-row import lookups with staged/batched processing, duplicate
  validation, progress, and recoverable batch status.
- Add optional price-level and product-image tables without changing current
  retail/wholesale behavior.
- Add development-only synthetic benchmarks and query-plan checks. Synthetic
  records must use an isolated temporary database, never the app database.
- Add safe maintenance/status APIs and document backup/recovery before migration.

## Optional Changes

- A native background import worker and CSV streaming parser may further improve
  100,000-row imports on low-memory devices after the batched implementation is
  measured on target hardware.
- Full list virtualization is useful for dense rows, but database pagination is
  the first requirement and avoids retaining an unbounded result set.
- Archived history partitions may be designed later. No automatic archival or
  deletion should be activated without explicit approval.

## Baseline Qualification

The previous release was exercised with approximately 1,000 products. It had no
100,000-product, 1,000,000-movement, or 500,000-sale benchmark evidence. The
requested target must therefore be treated as unproven until the isolated
benchmark and physical-device acceptance checks are completed.
