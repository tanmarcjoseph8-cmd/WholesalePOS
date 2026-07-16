# Migration Notes

The Android edition is an independent product with package ID
`com.wholesalepos.offline`. It does not connect to, package, migrate, or modify
the Windows Electron application.

There is no automatic transfer of Windows users, sales, tables, settings, or
SQLite files. Products and starting stock can be moved deliberately by exporting
or preparing a CSV/XLSX file in the documented Android import format. Reconcile
totals and quantities before using the tablet for live sales.

Android updates use ordered SQLite migrations recorded in `schema_migrations`.
Startup never drops or recreates the operational database. Keep the package ID
and release signing key unchanged, increment the Android version, make a full
backup, and install updates in place.

Version 0.2.0 adds migration 3 with `inventory_alert_state` and
`inventory_alerts`. It does not rewrite products, stock, sales, payments, users,
or settings. The first launch derives alert state from the authoritative
available-inventory view in one transaction. Existing data remains unchanged.

Version 0.4.0 adds migration 4 with `cash_sessions`, `cash_movements`, and links
from finalized cash sales and refunds to the drawer session. Existing sales,
payments, refunds, products, and stock records are not recalculated or rewritten.
The migration also removes Inventory access from the built-in Cashier role and
adds the limited `cash_drawer.use` permission. Owner permissions remain `*`;
Manager receives drawer use, management, review, and report permissions.
