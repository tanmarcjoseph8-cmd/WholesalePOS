# Android Architecture

## Runtime

```text
React tablet UI
  -> application services
    -> repositories and transaction boundary
      -> Capacitor SQLite (on-device only)
  -> platform adapters
    -> App lifecycle / back button
    -> File picker, filesystem, share sheet
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
- Backup restore validates format, schema version, and integrity before replacement.
- Database files are excluded from Android cloud backup to keep operational data local.

