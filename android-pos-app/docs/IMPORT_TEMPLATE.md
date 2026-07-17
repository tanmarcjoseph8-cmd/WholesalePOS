# Product Import Format

Select a CSV, XLS, or XLSX file from **Inventory**. The first worksheet is used,
with a limit of 100,000 rows per batch. The app previews valid and invalid rows,
rejects an import containing errors, detects an identical file fingerprint, and
offers skip or update behavior for matching SKU/barcode records. Duplicate SKU or
barcode values inside the same file are rejected before any product is written.

| Column | Required | Notes |
| --- | --- | --- |
| `name` | Yes | Alias: `product_name` |
| `sku` | SKU or barcode | File imports require at least one |
| `barcode` | SKU or barcode | Optional when SKU exists |
| `inventory_unit` | No | Alias: `unit`; defaults to `PIECE` |
| `selling_unit` | No | Defaults to inventory unit |
| `cost_price` | No | Alias: `cost`; defaults to zero |
| `retail_price` | No | Alias: `price`; defaults to zero |
| `wholesale_price` | No | Alias: `wholesale`; defaults to retail |
| `starting_stock` | No | Alias: `stock`; defaults to zero |
| `minimum_stock` | No | Alias: `low_stock_threshold`; defaults to zero |

Units must be one of: `PIECE`, `KILOGRAM`, `GRAM`, `LITER`, `MILLILITER`,
`METER`, `CENTIMETER`, `YARD`, `FOOT`, `CASE`, or `PACK`. Prices are Philippine
peso values, not centavos.

See `product-import-template.csv` for an editable example. Make a full backup
before a large update import.

Large imports are committed as one transaction and sent to SQLite in 250-row
batches. Cancelling or encountering an error rolls back every product and stock
change from that import. CSV uses less memory than XLSX and is recommended for
older Fire OS tablets.
