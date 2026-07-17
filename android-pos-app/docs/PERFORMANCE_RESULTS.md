# Scalability Benchmark Results

## Scope

The development benchmark creates a temporary SQLite database and never opens
the app's production database. The July 18, 2026 run used:

- 100,000 products and barcodes
- 1,000,000 inventory movements
- 500,000 sales, sale items, and payments
- a 624.7 MB generated database
- Python 3.14.6 with SQLite 3.50.4 on Windows

Run it with:

```powershell
python scripts\benchmark_scalability.py
```

The complete machine-readable result is in `PERFORMANCE_RESULTS.json`.

## Results

| Operation | Average | p95 | Maximum |
| --- | ---: | ---: | ---: |
| Exact barcode lookup at 100k products | 0.012 ms | 0.009 ms | 0.170 ms |
| First catalog page, 60 rows | 0.030 ms | 0.042 ms | 0.096 ms |
| Product-name prefix page | 0.038 ms | 0.043 ms | 0.101 ms |
| Exact SKU lookup | 0.005 ms | 0.008 ms | 0.027 ms |
| Recent product movements | 0.015 ms | 0.021 ms | 0.134 ms |
| Sales history page, 100 rows | 0.074 ms | 0.070 ms | 0.419 ms |
| Product edit commit | 0.037 ms | 0.035 ms | 0.187 ms |
| Conditional inventory deduction | 0.015 ms | 0.017 ms | 0.052 ms |
| Daily sales aggregate | 0.009 ms | 0.014 ms | 0.080 ms |
| Monthly sales aggregate | 234.649 ms | 242.845 ms | 267.289 ms |

The former general barcode search averaged 50.408 ms. The exact indexed query
averaged 0.012 ms on the full dataset. SQLite's query planner used the unique
barcode index, product primary key, and inventory-stock primary key.

### Barcode Catalog Scale

| Unique products | Average | p95 | Maximum |
| ---: | ---: | ---: | ---: |
| 1,000 | 0.002 ms | 0.002 ms | 0.027 ms |
| 10,000 | 0.003 ms | 0.002 ms | 0.038 ms |
| 50,000 | 0.003 ms | 0.003 ms | 0.058 ms |
| 100,000 | 0.003 ms | 0.003 ms | 0.062 ms |

## Interpretation

These results qualify the SQLite schema and query shapes, not every Android
device. Capacitor bridge overhead, WebView rendering, XLSX parsing, camera scan
latency, flash storage, available RAM, and thermal throttling are not represented
by this desktop benchmark. A release candidate must still pass the physical
device checklist in `SCALABILITY_GUIDE.md` on the oldest supported Fire OS 7
tablet and a representative current Android tablet.

