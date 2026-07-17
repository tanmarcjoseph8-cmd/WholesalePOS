"""Development-only SQLite scalability benchmark. Never opens the app database."""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import statistics
import tempfile
import time
from pathlib import Path


def timed_samples(connection: sqlite3.Connection, sql: str, values: tuple = (), runs: int = 40) -> dict[str, float]:
    durations: list[float] = []
    row_count = 0
    for _ in range(runs):
        started = time.perf_counter()
        rows = connection.execute(sql, values).fetchall()
        durations.append((time.perf_counter() - started) * 1000)
        row_count = len(rows)
    ordered = sorted(durations)
    p95_index = min(len(ordered) - 1, max(0, round(len(ordered) * 0.95) - 1))
    return {
        "runs": runs,
        "rows": row_count,
        "average_ms": round(statistics.fmean(durations), 3),
        "median_ms": round(statistics.median(durations), 3),
        "p95_ms": round(ordered[p95_index], 3),
        "maximum_ms": round(max(durations), 3),
    }


def timed_actions(action, runs: int = 30) -> dict[str, float]:
    durations: list[float] = []
    for index in range(runs):
        started = time.perf_counter()
        action(index)
        durations.append((time.perf_counter() - started) * 1000)
    ordered = sorted(durations)
    p95_index = min(len(ordered) - 1, max(0, round(len(ordered) * 0.95) - 1))
    return {
        "runs": runs,
        "average_ms": round(statistics.fmean(durations), 3),
        "median_ms": round(statistics.median(durations), 3),
        "p95_ms": round(ordered[p95_index], 3),
        "maximum_ms": round(max(durations), 3),
    }


def insert_chunks(connection: sqlite3.Connection, sql: str, rows, chunk_size: int = 25_000) -> None:
    chunk = []
    for row in rows:
        chunk.append(row)
        if len(chunk) >= chunk_size:
            connection.executemany(sql, chunk)
            chunk.clear()
    if chunk:
        connection.executemany(sql, chunk)


def create_schema(connection: sqlite3.Connection) -> None:
    connection.executescript(
        """
        PRAGMA journal_mode=WAL;
        PRAGMA synchronous=NORMAL;
        PRAGMA temp_store=MEMORY;
        CREATE TABLE products(id TEXT PRIMARY KEY, category_id TEXT, sku TEXT COLLATE NOCASE UNIQUE,
          name TEXT COLLATE NOCASE, status TEXT, deleted_at TEXT, created_at TEXT);
        CREATE INDEX products_name_idx ON products(name);
        CREATE INDEX products_active_idx ON products(status, deleted_at);
        CREATE TABLE product_barcodes(id TEXT PRIMARY KEY, product_id TEXT, value TEXT COLLATE NOCASE UNIQUE,
          is_primary INTEGER, created_at TEXT);
        CREATE INDEX product_barcodes_product_idx ON product_barcodes(product_id);
        CREATE TABLE inventory_stock(product_id TEXT, warehouse_id TEXT, quantity_micro INTEGER,
          updated_at TEXT, PRIMARY KEY(product_id, warehouse_id));
        CREATE TABLE inventory_reservations(id TEXT PRIMARY KEY, product_id TEXT, warehouse_id TEXT,
          quantity_micro INTEGER, status TEXT);
        CREATE INDEX reservations_stock_idx ON inventory_reservations(product_id, warehouse_id, status);
        CREATE TABLE inventory_movements(id TEXT PRIMARY KEY, product_id TEXT, warehouse_id TEXT, type TEXT,
          quantity_micro INTEGER, reference_type TEXT, reference_id TEXT, created_at TEXT);
        CREATE INDEX inventory_movements_product_idx ON inventory_movements(product_id, created_at DESC);
        CREATE TABLE sales(id TEXT PRIMARY KEY, receipt_number TEXT UNIQUE, cashier_id TEXT, order_type TEXT,
          status TEXT, grand_total_cents INTEGER, created_at TEXT, deleted_at TEXT);
        CREATE INDEX sales_created_idx ON sales(created_at DESC);
        CREATE INDEX sales_status_idx ON sales(status, created_at DESC);
        CREATE TABLE sale_items(id TEXT PRIMARY KEY, sale_id TEXT, product_id TEXT, unit_price_cents INTEGER);
        CREATE INDEX sale_items_sale_idx ON sale_items(sale_id);
        CREATE INDEX sale_items_product_idx ON sale_items(product_id);
        CREATE TABLE sale_payments(id TEXT PRIMARY KEY, sale_id TEXT, method TEXT, amount_cents INTEGER, created_at TEXT);
        CREATE INDEX sale_payments_sale_idx ON sale_payments(sale_id);
        """
    )


def seed(connection: sqlite3.Connection, products: int, movements: int, sales: int) -> dict[str, float]:
    started = time.perf_counter()
    insert_chunks(connection, "INSERT INTO products VALUES (?,?,?,?,?,?,?)", (
        (f"p{i:06d}", f"c{i % 100:03d}", f"SKU{i:06d}", f"Product {i:06d}", "ACTIVE", None, "2026-01-01T00:00:00.000Z")
        for i in range(products)
    ))
    insert_chunks(connection, "INSERT INTO product_barcodes VALUES (?,?,?,?,?)", (
        (f"b{i:06d}", f"p{i:06d}", f"480{i:010d}", 1, "2026-01-01T00:00:00.000Z") for i in range(products)
    ))
    insert_chunks(connection, "INSERT INTO inventory_stock VALUES (?,?,?,?)", (
        (f"p{i:06d}", "warehouse_main", 10_000_000_000, "2026-01-01T00:00:00.000Z") for i in range(products)
    ))
    product_seconds = time.perf_counter() - started

    started = time.perf_counter()
    insert_chunks(connection, "INSERT INTO inventory_movements VALUES (?,?,?,?,?,?,?,?)", (
        (f"m{i:07d}", f"p{i % products:06d}", "warehouse_main", "STOCK_IN" if i % 4 else "SALE", 1_000_000,
         "Benchmark", f"r{i:07d}", f"2026-{1 + (i % 6):02d}-{1 + (i % 28):02d}T12:00:00.000Z")
        for i in range(movements)
    ))
    movement_seconds = time.perf_counter() - started

    started = time.perf_counter()
    insert_chunks(connection, "INSERT INTO sales VALUES (?,?,?,?,?,?,?,?)", (
        (f"s{i:07d}", f"POS-{i:07d}", f"u{i % 20:02d}", "RETAIL" if i % 3 else "WHOLESALE", "COMPLETED",
         10000 + (i % 50000), f"2026-{1 + (i % 6):02d}-{1 + (i % 28):02d}T12:00:00.000Z", None)
        for i in range(sales)
    ))
    insert_chunks(connection, "INSERT INTO sale_items VALUES (?,?,?,?)", (
        (f"si{i:07d}", f"s{i:07d}", f"p{i % products:06d}", 10000 + (i % 1000)) for i in range(sales)
    ))
    insert_chunks(connection, "INSERT INTO sale_payments VALUES (?,?,?,?,?)", (
        (f"sp{i:07d}", f"s{i:07d}", "CASH" if i % 2 else "GCASH", 10000 + (i % 50000), f"2026-{1 + (i % 6):02d}-{1 + (i % 28):02d}T12:00:00.000Z")
        for i in range(sales)
    ))
    sales_seconds = time.perf_counter() - started
    connection.commit()
    return {"product_import_seconds": round(product_seconds, 3), "movement_insert_seconds": round(movement_seconds, 3), "sales_insert_seconds": round(sales_seconds, 3)}


def add_optimized_indexes(connection: sqlite3.Connection) -> float:
    started = time.perf_counter()
    connection.executescript(
        """
        CREATE INDEX products_active_name_page_idx ON products(status, name COLLATE NOCASE, id) WHERE deleted_at IS NULL;
        CREATE INDEX products_category_name_page_idx ON products(category_id, status, name COLLATE NOCASE, id) WHERE deleted_at IS NULL;
        CREATE INDEX inventory_movements_created_idx ON inventory_movements(created_at DESC);
        CREATE INDEX inventory_movements_type_created_idx ON inventory_movements(type, created_at DESC);
        CREATE INDEX inventory_movements_product_type_created_idx ON inventory_movements(product_id, type, created_at DESC);
        CREATE INDEX sales_cashier_created_idx ON sales(cashier_id, created_at DESC) WHERE deleted_at IS NULL;
        CREATE INDEX sales_order_type_created_idx ON sales(order_type, created_at DESC) WHERE deleted_at IS NULL;
        CREATE INDEX sales_history_page_idx ON sales(created_at DESC, id DESC) WHERE deleted_at IS NULL;
        CREATE INDEX sale_items_product_sale_idx ON sale_items(product_id, sale_id);
        CREATE INDEX sale_payments_method_created_idx ON sale_payments(method, created_at DESC);
        ANALYZE;
        """
    )
    connection.commit()
    return round(time.perf_counter() - started, 3)


def barcode_scale_benchmark(scales: list[int]) -> dict[str, dict[str, float]]:
    results: dict[str, dict[str, float]] = {}
    for count in scales:
        connection = sqlite3.connect(":memory:")
        connection.executescript(
            """
            CREATE TABLE products(id TEXT PRIMARY KEY, sku TEXT COLLATE NOCASE UNIQUE, name TEXT, status TEXT, deleted_at TEXT);
            CREATE TABLE product_barcodes(id TEXT PRIMARY KEY, product_id TEXT, value TEXT COLLATE NOCASE UNIQUE, is_primary INTEGER);
            """
        )
        insert_chunks(connection, "INSERT INTO products VALUES (?,?,?,?,?)", (
            (f"p{i:06d}", f"SKU{i:06d}", f"Product {i:06d}", "ACTIVE", None) for i in range(count)
        ))
        insert_chunks(connection, "INSERT INTO product_barcodes VALUES (?,?,?,?)", (
            (f"b{i:06d}", f"p{i:06d}", f"480{i:010d}", 1) for i in range(count)
        ))
        connection.commit()
        barcode = f"480{count - 1:010d}"
        results[str(count)] = timed_samples(
            connection,
            "SELECT p.id,p.sku,p.name FROM product_barcodes b JOIN products p ON p.id=b.product_id WHERE b.value=? COLLATE NOCASE AND p.status='ACTIVE' AND p.deleted_at IS NULL LIMIT 1",
            (barcode,),
            runs=60,
        )
        connection.close()
    return results


def run(args: argparse.Namespace) -> dict:
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="suki-sync-benchmark-") as directory:
        database_path = Path(directory) / "benchmark.sqlite"
        opened = time.perf_counter()
        connection = sqlite3.connect(database_path)
        startup_ms = (time.perf_counter() - opened) * 1000
        create_schema(connection)
        seed_times = seed(connection, args.products, args.movements, args.sales)
        barcode = f"480{args.products - 1:010d}"
        baseline_catalog = """SELECT p.id, p.sku, b.value, p.name, COALESCE(s.quantity_micro,0)
          FROM products p LEFT JOIN product_barcodes b ON b.product_id=p.id AND b.is_primary=1
          LEFT JOIN inventory_stock s ON s.product_id=p.id AND s.warehouse_id='warehouse_main'
          WHERE p.deleted_at IS NULL AND p.status='ACTIVE'
            AND (p.name LIKE ? COLLATE NOCASE OR p.sku LIKE ? COLLATE NOCASE OR b.value LIKE ? COLLATE NOCASE)
          ORDER BY p.name LIMIT 2000"""
        exact_barcode = """SELECT p.id,p.sku,p.name,p.status,s.quantity_micro FROM product_barcodes b
          JOIN products p ON p.id=b.product_id LEFT JOIN inventory_stock s ON s.product_id=p.id AND s.warehouse_id='warehouse_main'
          WHERE b.value=? COLLATE NOCASE AND p.status='ACTIVE' AND p.deleted_at IS NULL LIMIT 1"""
        before = {
            "barcode_general_search": timed_samples(connection, baseline_catalog, (f"%{barcode}%",) * 3),
            "catalog_first_2000": timed_samples(connection, baseline_catalog, ("%%",) * 3, runs=15),
            "product_name_contains": timed_samples(connection, baseline_catalog, ("%99999%",) * 3),
            "sales_history_1000": timed_samples(connection, "SELECT id,receipt_number,status,grand_total_cents,created_at FROM sales WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1000", runs=20),
        }
        index_seconds = add_optimized_indexes(connection)
        after = {
            "barcode_exact": timed_samples(connection, exact_barcode, (barcode,)),
            "catalog_page_60": timed_samples(connection, "SELECT id,sku,name FROM products WHERE status='ACTIVE' AND deleted_at IS NULL ORDER BY name COLLATE NOCASE,id LIMIT 60"),
            "product_name_prefix": timed_samples(connection, "SELECT id,sku,name FROM products WHERE status='ACTIVE' AND deleted_at IS NULL AND name LIKE ? COLLATE NOCASE ORDER BY name COLLATE NOCASE,id LIMIT 60", ("Product 099%",)),
            "sku_exact": timed_samples(connection, "SELECT id,sku,name FROM products WHERE sku=? COLLATE NOCASE AND deleted_at IS NULL LIMIT 1", (f"SKU{args.products - 1:06d}",)),
            "movement_product_recent": timed_samples(connection, "SELECT id,type,quantity_micro,created_at FROM inventory_movements WHERE product_id=? ORDER BY created_at DESC LIMIT 100", (f"p{args.products - 1:06d}",)),
            "sales_history_page_100": timed_samples(connection, "SELECT id,receipt_number,status,grand_total_cents,created_at FROM sales WHERE deleted_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 100"),
            "receipt_exact": timed_samples(connection, "SELECT id,status,grand_total_cents FROM sales WHERE receipt_number=? LIMIT 1", (f"POS-{args.sales - 1:07d}",)),
            "daily_report": timed_samples(connection, "SELECT COUNT(*),SUM(grand_total_cents) FROM sales WHERE created_at>=? AND created_at<? AND status IN ('COMPLETED','PARTIALLY_REFUNDED') AND deleted_at IS NULL", ("2026-06-15T00:00:00.000Z", "2026-06-16T00:00:00.000Z")),
            "monthly_report": timed_samples(connection, "SELECT COUNT(*),SUM(grand_total_cents) FROM sales WHERE created_at>=? AND created_at<? AND status IN ('COMPLETED','PARTIALLY_REFUNDED') AND deleted_at IS NULL", ("2026-06-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z"), runs=20),
        }
        write_operations = {
            "product_edit": timed_actions(lambda index: (connection.execute("UPDATE products SET name=? WHERE id=?", (f"Product edited {index}", f"p{args.products - 1:06d}")), connection.commit())),
            "inventory_deduction": timed_actions(lambda index: (connection.execute("UPDATE inventory_stock SET quantity_micro=quantity_micro-1000, updated_at=? WHERE product_id=? AND warehouse_id='warehouse_main' AND quantity_micro>=1000", (f"2026-07-01T00:00:{index:02d}.000Z", f"p{args.products - 1:06d}")), connection.commit())),
        }
        plan = [row[3] for row in connection.execute("EXPLAIN QUERY PLAN " + exact_barcode, (barcode,)).fetchall()]
        size = os.path.getsize(database_path)
        connection.close()
        result = {
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "environment": {"python": os.sys.version.split()[0], "sqlite": sqlite3.sqlite_version, "platform": os.name, "temporary_database": str(database_path)},
            "dataset": {"products": args.products, "inventory_movements": args.movements, "sales": args.sales, "sale_items": args.sales, "payments": args.sales, "database_bytes": size},
            "startup_ms": round(startup_ms, 3),
            "data_generation": seed_times,
            "optimized_index_build_seconds": index_seconds,
            "before": before,
            "after": after,
            "write_operations": write_operations,
            "barcode_lookup_by_catalog_size": barcode_scale_benchmark([1_000, 10_000, 50_000, 100_000]),
            "exact_barcode_query_plan": plan,
            "qualification": "Desktop SQLite synthetic query benchmark; native Android bridge, WebView rendering, XLSX parsing, and physical storage latency require device testing."
        }
        output.write_text(json.dumps(result, indent=2), encoding="utf-8")
        return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--products", type=int, default=100_000)
    parser.add_argument("--movements", type=int, default=1_000_000)
    parser.add_argument("--sales", type=int, default=500_000)
    parser.add_argument("--output", default="docs/PERFORMANCE_RESULTS.json")
    print(json.dumps(run(parser.parse_args()), indent=2))
