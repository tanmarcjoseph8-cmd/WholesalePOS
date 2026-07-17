# Migration Notes

## 0.8.0 large-catalog migration

Version 0.8.0 adds migration 9. It creates additive catalog, movement, sales,
item, payment, refund, and history indexes. It also creates `price_levels`,
`product_prices`, and `product_images`; existing product, inventory, sale,
license, user, and audit rows are not rewritten or deleted.

Migration 9 runs through the existing transactional migration runner. Make a full
0.7.0 backup before installation. If startup fails, preserve app storage and the
database; do not use Factory Reset. Reinstall 0.8.0 and retry after collecting the
startup error. A downgrade requires restoring the pre-upgrade backup into a 0.7.0
test installation because the older binary does not manage the new tables.

The retail and wholesale columns remain authoritative fallbacks, so products made
by older releases continue to sell at the same prices until a manager adds an
effective-dated price rule.

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

Version 0.4.1 adds migration 5. It grants the built-in Cashier role the limited
`inventory.alerts.view` permission so cashiers can identify the exact products
that are low or out of stock. It does not grant `inventory.view` or
`inventory.manage`, so cashiers still cannot open Inventory, edit products,
import products, or change stock. No operational records are rewritten.

Version 0.5.0 adds migration 6 with the `device_state` table and seeds a local
Installation ID. Existing users, products, stock, orders, sales, payments,
settings, and audit records remain unchanged during the update. A successful
Owner Factory Reset regenerates this ID while preserving migration history,
schema version 6, built-in roles, and the default warehouse.

Version 0.6.0 adds migration 7 with the singleton `license_state` table. The
update does not rewrite users, products, stock, orders, sales, payments,
settings, or audit records. Existing installations open the activation gate
once after updating. A successful Owner Factory Reset preserves `license_state`
while erasing business data and leaves the database at schema version 7.

Version 0.7.0 adds migration 8 with signed license type, expiration, and serial
number fields. The migration is additive and does not rewrite or delete users,
products, stock, orders, sales, payments, settings, or audit records. Existing
version 1 activation codes are interpreted as lifetime licenses. The visible
app name changes to Suki Sync, but the package ID, signing certificate, database
identity, Device ID rules, and backup compatibility remain unchanged for safe
in-place updates.
