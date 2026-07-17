# Android Architecture

## Runtime

```text
React tablet UI
  -> application services
    -> repositories and transaction boundary
      -> Capacitor SQLite (on-device only)
  -> platform adapters
    -> App lifecycle / back button
    -> File picker, filesystem, PDF viewer, share sheet
    -> Android local notification channels and deep links
    -> receipt PDF and printer interface
```

No HTTP server, loopback port, remote database, or Windows process is required.

## Source boundaries

- `src/domain/`: platform-independent records, commands, validation, units, money, and errors.
- `src/data/`: SQLite connection, schema migrations, query helpers, and seed data.
- `src/services/`: transactional product, inventory, order, sale, refund, report, backup, and security workflows.
- `src/platform/`: Capacitor lifecycle, files, sharing, and printer adapters.
- `src/ui/`: tablet application shell, reusable controls, dialogs, and views.
- `src/state/`: in-process refresh events and current local session.

## Data safety

- Foreign keys and WAL mode are enabled on every connection.
- Migrations are ordered and recorded in `schema_migrations`.
- Transactions use `BEGIN IMMEDIATE`, `COMMIT`, and `ROLLBACK`.
- Financial amounts are integer centavos.
- Quantities are stored as integer millionths of the base unit.
- Unique request keys make checkout and reversal submissions idempotent.
- Sales reports are derived from finalized sales, sale items, payments, refunds,
  and voids in the same local database; no reporting cache duplicates totals.
- Available stock is physical stock minus active order reservations. A set-based
  reconciliation transaction persists alert state and transition history for the
  full catalog without per-product native bridge calls.
- Backup restore validates format, schema version, and integrity before replacement.
- Database files are excluded from Android cloud backup to keep operational data local.
- `FactoryResetService` provides the only in-app destructive reset path. It
  reauthorizes the stored Owner, verifies the exact phrase and final consent,
  creates a persistent backup by default, and performs dependency-ordered
  deletion in one SQLite transaction.
- The operation coordinator makes checkout and reset mutually exclusive.
  Migrations also block reset. Post-delete checks require 24 empty business
  tables, the unchanged schema version, valid foreign keys, and SQLite integrity
  before commit.
- Migration 6 stores a local Installation ID in `device_state`; a successful
  reset regenerates it without changing the app identity or schema.
- Migration 7 stores the signed, device-bound activation in `license_state`.
  Startup verifies its P-256 signature with an embedded public JWK before any
  business screen opens. Factory reset deliberately preserves this table.

## License boundary

Android contains only public-key verification, stable Device ID derivation, and
the local signed activation record. Customer management and code signing live in
the separate Windows License Manager. Its main Electron process owns the private
key, encrypted vault, imports, exports, printing, and backups. The sandboxed
renderer receives only narrow IPC operations and never key material. This
boundary permits a future synchronization adapter without moving licensing into
POS, inventory, restaurant, reporting, or other business services.
