# File Summary

All created or modified files are contained in `android-pos-app/`. Existing
Windows application files changed: **none**.

## Project and build

- `package.json`, `pnpm-lock.yaml`: independent dependencies and scripts.
- `capacitor.config.ts`: stable Android identity and offline Capacitor settings.
- `vite.config.ts`, `vitest.config.ts`, `tsconfig*.json`, `eslint.config.js`:
  TypeScript, build, test, and lint configuration.
- `index.html`, `.gitignore`: application entry and artifact exclusions.
- `scripts/create-release-keystore.mjs`, `scripts/collect-apk.mjs`: signing
  bootstrap and reproducible artifact collection/checksums.
- `apk/.gitkeep`, `apk/checksums.json`: artifact directory and hashes.

## Application source

- `src/domain/models.ts`, `calculations.ts`, `security.ts`: typed records, units,
  integer money/quantity calculations, UUID compatibility, and PBKDF2.
- `src/domain/app-metadata.ts`, `factory-reset-rules.ts`, and
  `factory-reset-rules.test.ts`: release identity and pure Owner reset guards.
- `src/domain/cash-drawer.ts`, `cash-drawer.test.ts`: integer cash formulas,
  PHP denomination definitions, and reconciliation records.
- `src/domain` test files: calculation and credential tests.
- `src/data/database.ts`, `migrations.ts`, `migrations.test.ts`: Capacitor SQLite
  adapter, transactions, export/import, schema, and migration checks.
- `src/services` TypeScript files: auth, catalog, inventory, sales/refunds,
  restaurant, settings/reports, imports/exports, backups, receipts, and auditing.
- `src/services/cash-drawer-service.ts` and its tests: drawer lifecycle,
  immutable movements, session ownership, corrections, review, and transaction
  linkage for cash sales and refunds.
- `src/services/factory-reset-service.ts` and its tests: Owner-only guarded reset,
  persistent pre-reset backup, dependency-ordered transactional deletion,
  Installation ID regeneration, and post-delete database verification.
- `src/services/operation-coordinator.ts`: mutual exclusion for checkout and
  factory reset.
- `src/services/backup-service.test.ts`: persistent reset-backup metadata and
  audit-export coverage.
- `src/services/inventory-alert-service-access.test.ts`: read-only cashier stock
  alert authorization and rejection of users without alert permission.
- `src/platform` TypeScript files: Android lifecycle, back button, file picker,
  filesystem, share, legacy WebView compatibility, and platform boundaries.
- `src/ui/App.tsx`, `app-context.ts`, `AuthScreen.tsx`, `ConfirmDialog.tsx`:
  session shell and reusable UI behavior.
- `src/ui/FactoryResetPanel.tsx`: Owner-only warning, reauthentication, exact
  phrase, final counts, progress, and success flow.
- `src/ui/views` TSX files: dashboard, POS, cash drawer, inventory/import,
  restaurant, sales, reports, users, settings, backups, and exports.
- `src/main.tsx`, `src/styles.css`: application bootstrap and responsive styling.

## Native Android project

- `android/gradle`, `android/build.gradle`, `settings.gradle`,
  `variables.gradle`: Gradle wrapper and API 28/36 configuration.
- `android/app/build.gradle`, `proguard-rules.pro`: application, release signing,
  shrinking, and R8 rules.
- `android/app/src/main/AndroidManifest.xml`: offline manifest and backup policy.
- `android/app/src/main/java/com/wholesalepos/offline/MainActivity.java`: native
  Capacitor activity.
- `android/app/src/main/res`: launcher, splash, styles, file provider, and
  data-extraction resources.
- `ApplicationConfigTest.java`: stable package test.
- `OfflineSecurityTest.java`: device assertion that internet permission is absent.

## Documentation

- `docs/AUDIT.md`, `ARCHITECTURE.md`: protected baseline and Android design.
- `docs/BUILD_AND_INSTALL.md`, `USER_GUIDE.md`, `BACKUP_RESTORE.md`,
  `PRINTER_SETUP.md`, `IMPORT_TEMPLATE.md`, `FIRE_OS_7.md`,
  `product-import-template.csv`,
  `MIGRATION_NOTES.md`, `CASH_DRAWER.md`, `KNOWN_LIMITATIONS.md`, `TEST_REPORT.md`: build,
  operation, recovery, import, migration, constraints, and evidence.
- `docs/FACTORY_RESET.md`: complete reset behavior, preserved/erased data,
  backup location, database method, failures, verification, and artifact paths.
- `docs/factory-reset/*.png`: warning, Owner reauthentication, typed phrase,
  final confirmation, progress, success, and fresh-setup emulator screenshots.
