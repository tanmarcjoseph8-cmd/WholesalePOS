# Phase 3 Database

Phase 3 completes the database foundation for the requested offline POS workflows. The Prisma schema remains the source of truth, and SQLite remains the production database for the single-device Windows app.

## Completed

- Added product fields for package size and wholesale threshold.
- Added settings storage for business, tax, receipt, printer, theme, GCash QR, and backup preferences.
- Added receipt sequence storage for safe receipt numbering.
- Added receipt print logs for receipt and reprint auditing.
- Added held-sale tables for suspended POS carts.
- Added refund tables for recoverable refund history.
- Added barcode label batch records.
- Added backup run history.
- Added uploaded asset metadata for local files.
- Added cash drawer sessions.
- Added stock alert records for low-stock and out-of-stock states.
- Created and applied SQLite migration `20260703202441_phase3_schema`.

## Migration

The Phase 3 migration is:

```text
backend/prisma/migrations/20260703202441_phase3_schema/migration.sql
```

It creates the new tables, indexes the common report and lookup paths, and safely adds defaulted product fields without deleting existing product data.

## Verification

Phase 3 must pass:

```bash
pnpm db:generate
pnpm verify
pnpm desktop:package:win
pnpm desktop:smoke:win
```

The next phase is Phase 4: authentication, roles, permissions, and protected screens.
