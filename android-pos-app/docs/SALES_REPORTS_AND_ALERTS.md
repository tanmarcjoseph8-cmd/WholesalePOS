# Sales Reports and Inventory Alerts

## Sales reports

The **Reports** screen supports today, this week, this month, previous day,
previous week, previous month, and custom inclusive dates. Date boundaries use
the IANA business timezone saved in Settings, defaulting to `Asia/Manila`.

Only `COMPLETED`, `PARTIALLY_REFUNDED`, `REFUNDED`, and separately displayed
`VOIDED` rows from the finalized `sales` table are report candidates. Open,
cancelled, pending, or unpaid records are rejected by both the SQLite query and
the report calculator. Voided sales are excluded from completed transaction and
net-sales totals. Completed refunds subtract their recorded item quantities,
line values, payment values, and grand totals.

The report includes gross sales before discounts, discounts, taxes, service
charges, tips, refunds, voids, net sales, completed transaction count, average
transaction, net quantity sold, cash sales, payment methods, order types, best
sellers, highest sales-value products, and optional transaction details. Cash
tender is reduced by customer change before payment totals are calculated.

PDF exports are generated locally as A4 documents. The app can create a summary
or detailed PDF, show an in-app preview where supported, open an installed PDF
viewer, and invoke Android Share for save, send, or print. A verified example is
available at `docs/sample-sales-report.pdf`.

The current report groups a completed refund or void with the original sale's
selected period. This keeps sale, item, payment, and reversal totals internally
consistent with the existing database relationship. It is not a separate
cash-movement report by refund-processing date.

## Inventory alert rules

Alert quantities come from `available_inventory`:

```text
available stock = physical stock - active restaurant order reservations
```

Each product uses its own positive low-stock threshold. If that threshold is
zero, the default threshold in Settings is used. Quantities at or below zero are
out of stock. Positive quantities at or below the effective threshold are low
stock. All other quantities are normal.

An alert is created only when stock enters low or out-of-stock status, including
low to out of stock. Repeated refreshes in the same status do not duplicate it.
When stock returns to normal, the active alert is resolved. A later threshold
crossing creates a new alert, so restock-then-deplete cycles always notify again.

Alert state, read state, clear state, resolved state, quantities, thresholds,
warehouse, and timestamps are stored in SQLite. Clearing read alerts is a soft
clear and never deletes inventory history. The Alerts screen can deep-link to the
affected product. The Android notification uses the same product and alert IDs.

## Android notification behavior

The app creates audible and silent inventory notification channels. Settings can
enable or disable all inventory notifications, low-stock events, out-of-stock
events, and sound. Android 13 and later request notification permission at
runtime. Fire OS 7 and Android 12 or earlier use the operating system's existing
application-notification controls.

The manifest requests `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED`, and
`WAKE_LOCK` through the local-notification plugin. It does not request internet,
external storage, or exact-alarm permission. Reports and alerts remain fully
offline and use the same authoritative SQLite records as sales and inventory.
