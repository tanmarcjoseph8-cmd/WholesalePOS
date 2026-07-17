# Owner Factory Reset

Factory Reset is an offline, Owner-only recovery tool for returning this Android
installation to its genuine first-run state. It is available under **Settings >
Advanced > Factory Reset**. Managers and cashiers cannot see the control, and
the service independently rejects every non-Owner request.

## Safety sequence

1. The Owner opens Factory Reset and reviews the permanent-deletion warning.
2. A full backup is selected by default. Turning it off requires a separate
   acknowledgement that the erased data cannot be recovered.
3. The app reads live counts for products, sales, users, orders, and cash drawer
   sessions, and warns about an open drawer or unpaid orders.
4. The Owner enters their current PIN or password. The existing credential hash
   verifier reauthenticates the active, stored Owner account.
5. The Owner types `FACTORY RESET` exactly.
6. The final confirmation displays the live record counts and requires an
   explicit **Erase All Data** action.
7. The app blocks payment processing, displays progress, creates and verifies
   the backup, clears notifications and generated files, and resets SQLite.
8. The app verifies the empty tables, schema version, foreign keys, and database
   integrity before committing. It then reloads to first-owner setup.

Reset and checkout are mutually exclusive. A database migration also blocks a
reset. Repeated reset taps cannot begin a second reset operation.

## Data erased

The single SQLite reset transaction removes products, categories, barcodes,
stock balances, stock movements, reservations, inventory alerts, imports,
restaurant tables and orders, sales and payments, refunds, cash sessions and
movements, settings, audit logs, and local users. Receipt, order, and refund
sequences return to `1`. Android notification history and app-generated reports,
exports, product images, and business assets are cleared.

No business record is physically dropped from the schema. Reset uses ordered
`DELETE` and relationship-detachment statements inside `BEGIN IMMEDIATE`, then
`COMMIT` or `ROLLBACK`. It never executes `DROP TABLE`, `ALTER TABLE`, or schema
creation statements.

## Preserved capabilities

The app package, release signature, schema migrations, SQLite table definitions,
built-in roles, default warehouse, screen code, reporting, POS, restaurant,
printing, imports, and backup/restore features remain installed. The database
stays at schema version 7. The signed `license_state` record is preserved, while
a new local Installation ID is generated after every successful reset.

Factory Reset returns to first-owner setup without asking for activation again.
App uninstall, Android storage clearing, or a tablet factory reset are separate
operations and remove the local activation record.

## Backup

The default pre-reset backup is a full integrity-protected JSON export named
`before-factory-reset-<timestamp>.json`. It includes the reset request audit
record and metadata for Owner user ID, register ID, app version, backup filename,
reset type, and pending result. The payload is protected with SHA-256.

On Android the file is written and size-verified in:

```text
Android/data/com.wholesalepos.offline/files/WholesalePOS Backups/
```

Debug builds use the `.debug` package directory. This app-specific external
folder survives the in-app reset but may be removed by app uninstall, storage
clearing, or tablet reset. Move important backups to another device or drive.
If backup creation or verification fails, no database deletion begins.

## Failure handling

- Incorrect Owner credentials, an inexact phrase, a missing final confirmation,
  or an unacknowledged no-backup choice stops before deletion.
- Backup failure stops before deletion and shows a retryable message.
- A database error rolls back the SQLite transaction.
- Post-reset table, schema, foreign-key, and integrity checks run before commit.
- Credentials are never written to logs, audit metadata, or backup metadata.

Derived files and Android notifications are cleared immediately before the
database transaction. If a later database error occurs, SQLite rolls back, but
those generated files and notifications are not recreated; authoritative
business records remain in the database.

## Database operations

The reset implementation is in `src/services/factory-reset-service.ts`.
Financial child records are deleted before sales and cash sessions; reservation
and order children before orders and tables; alert/import/movement/stock/barcode
records before products and categories; then settings, audit logs, and users.
`device_state` is recreated with a new Installation ID. `license_state` is not
part of the deletion set. All 24 business tables must report zero records before
commit.

## Verification

Version 0.6.0 passed ESLint, strict TypeScript, 79 Vitest tests in 19 files, the
Vite production build, Gradle native tests, debug/release APK builds, and release
signature verification. The Android 10 emulator completed the full guarded reset
with a verified persistent backup. The post-reset database reported schema 7,
`PRAGMA integrity_check = ok`, no foreign-key issues, zero records in all 24
business tables, three built-in roles, one default warehouse, reset sequences,
and a newly generated Installation ID.

Automated coverage includes role denial, Owner reauthentication, exact phrase,
backup acknowledgement, backup failure, transaction rollback, migration and
payment concurrency, ordered deletion, empty-table verification, schema
preservation, foreign-key and integrity failures, sequence reset, Installation
ID regeneration, and credential redaction.

## Screenshots

- [Permanent deletion warning](factory-reset/factory-reset-warning.png)
- [Owner reauthentication](factory-reset/factory-reset-owner-reauthentication.png)
- [Typed confirmation](factory-reset/factory-reset-typed-confirmation.png)
- [Final record counts](factory-reset/factory-reset-final-confirmation.png)
- [Blocking progress state](factory-reset/factory-reset-progress.png)
- [Successful reset](factory-reset/factory-reset-success.png)
- [Fresh first-owner setup](factory-reset/factory-reset-fresh-install.png)

## Installable artifacts

- Debug APK: `apk/WholesalePOS-Offline-0.6.0-debug.apk`
- Signed release APK: `apk/WholesalePOS-Offline-0.6.0-release.apk`
- Signed release bundle: `apk/WholesalePOS-Offline-0.6.0-release.aab`
- SHA-256 manifest: `apk/checksums.json`

The complete created/modified file inventory is maintained in
`docs/FILE_SUMMARY.md`. Existing Windows application files were not changed.
