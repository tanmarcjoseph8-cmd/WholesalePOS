# Verification Report

Verified through 18 July 2026.

## 0.8.0 scalability milestone

Completed in the current workspace:

- strict TypeScript build: passed;
- ESLint over `src`, `scripts`, and config files: passed;
- temporary SQLite benchmark at 100,000 products, 1,000,000 movements, and
  500,000 sales: passed and recorded in `PERFORMANCE_RESULTS.json`;
- exact barcode query-plan inspection: unique barcode, product primary key, and
  inventory-stock primary key indexes used.
- clean in-memory application of migrations 1 through 9: passed with zero foreign
  key violations.

Vitest and the Vite bundle could not run inside the managed filesystem sandbox:
esbuild attempted to inspect a protected parent directory. The request to run
those tools outside the sandbox was unavailable because the Codex approval quota
was exhausted. They remain mandatory before publishing the 0.8.0 APK. Native
Android/Fire OS verification also remains pending on physical devices.

Version 0.7.0 adds renewable offline Monthly, Yearly, and Lifetime licenses,
Android-Keystore-backed clock rollback detection, license expiration warnings,
same-device renewal, and Suki Sync mobile branding. Existing version 1 licenses
remain valid as lifetime licenses. The update keeps the package identity,
release certificate, business database, and secure Owner-only Factory Reset.

## Automated checks

- ESLint: passed.
- Strict TypeScript project build: passed with no errors.
- Vitest: 19 files, 82 tests passed for version 1 and version 2 offline
  activation signatures, renewable license terms, Device ID
  stability, factory-reset authorization, confirmation,
  backup failure, rollback, operation concurrency, ordered deletion, schema and
  integrity verification, Installation ID regeneration, cash reconciliation and
  authorization, reporting ranges and totals, finalized
  sale filtering, PDF pagination and sharing, alert transitions, notification
  permissions/deep links, inventory events, migrations, calculations, security,
  product activity mapping, cashier stock-alert authorization, ordered license
  migration, and legacy WebView compatibility.
- Vite production build targeting Chrome 61-era WebView syntax: passed.
- Capacitor Android sync: passed.
- Gradle native unit test: passed.
- Android 10 instrumentation test confirming no internet permission: passed.
- Gradle debug APK, signed release APK, and signed release AAB: passed.
- Version 0.6.0 installed on the Android 10 emulator; migration 7 completed and
  the complete Owner reset flow created a verified 25,642-byte persistent backup.
- Post-reset SQLite inspection found schema version 7, `integrity_check = ok`, no
  foreign-key violations, zero records in all 24 business tables, three built-in
  roles, one default warehouse, reset sequences, and a new Installation ID.
- The reset service preserves the signed license record and reloads to genuine
  first-owner setup with no fatal JavaScript, native, or SQLite error.
- Release APK signature: APK Signature Scheme v2, RSA 3072.
- Manifest: minimum API 28, target API 36, no `INTERNET` permission.
- Every packaged Capacitor plugin declares support for API 24 or newer.
- Sample A4 report: three pages rendered and visually checked; every page has a
  footer and page number, and monetary values use readable `PHP` labels.

## Android 10 emulator

- Signed release APK installed and launched with Wi-Fi and mobile data disabled.
- First-run SQLite migrations completed.
- Owner setup completed without internet.
- Forced process stop and restart returned to the unlock screen, proving local
  account data persisted.
- `adb install -r` update succeeded and the existing account remained.
- Version 0.2.1 installed in place over version 0.2.0 and retained the existing
  local account/database.
- An upgraded database with approximately 1,000 products reached the login
  screen after alert reconciliation was changed from per-product bridge calls
  to set-based SQLite statements.
- The app reported the local database as healthy.
- No fatal Android process or uncaught JavaScript error remained in the final run.

The emulator found and drove the fix for Android 10 WebView support:
`crypto.randomUUID()` now has a secure `crypto.getRandomValues()` UUID fallback.
Version 0.2.0 retains compatibility implementations for `replaceAll` and
`Object.fromEntries` before the React application starts on older WebViews.

The current release artifact is `Suki-Sync-0.7.0-release.apk`, version code 12.
It verifies with APK Signature Scheme v2 and the existing RSA 3072 release
certificate. Its application label is Suki Sync, minimum API is 28, target API
is 36, and the manifest contains no `INTERNET` permission.

The companion License Manager 1.1.0 passed strict TypeScript, ESLint, its Vite
production build, and 10 Vitest tests covering legacy signatures, renewable
payloads, tamper rejection, duplicate protection, renewal history, replacement,
vault recovery, and signing-key continuity.

## Fire OS 7 status

The app compiles, signs, and packages with minimum API 28, matching Fire OS 7.
An Android 9 emulator image could not be installed without accepting an additional
Google SDK license. Final validation therefore requires installing the signed APK
on the target Fire OS 7 tablet and testing its file picker, sharing, and printing.

## Hardware acceptance still required

Before production deployment, test one complete retail sale, restaurant table
sale, refund, bulk import, backup/restore drill, barcode hardware, receipt
printing, portrait/landscape layout, app update, tablet restart, and prolonged
offline operation on the exact physical tablet and printer models.
