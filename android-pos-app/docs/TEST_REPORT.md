# Verification Report

Verified through 16 July 2026.

Version 0.4.0 adds the offline cash drawer lifecycle, cash sale/refund ledger
links, denomination close, discrepancy review, reconciliation reporting, and
cashier-safe navigation. Cashier mode no longer exposes Inventory or its write
controls.

## Automated checks

- ESLint: passed.
- Strict TypeScript project build: passed with no errors.
- Vitest: 13 files, 41 tests passed for cash reconciliation and authorization,
  reporting ranges and totals, finalized
  sale filtering, PDF pagination and sharing, alert transitions, notification
  permissions/deep links, inventory events, migrations, calculations, security,
  product activity mapping, and legacy WebView compatibility.
- Vite production build targeting Chrome 61-era WebView syntax: passed.
- Capacitor Android sync: passed.
- Gradle native unit test: passed.
- Android 10 instrumentation test confirming no internet permission: passed.
- Gradle debug APK, signed release APK, and signed release AAB: passed.
- Version 0.4.0 installed in place on the Android 10 emulator; migration 4
  completed, the existing local account remained, and the app returned to login
  with no fatal JavaScript or SQLite error.
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

The current release artifact is `WholesalePOS-Offline-0.4.0-release.apk`, version
code 8. It verifies with APK Signature Scheme v2 and the existing RSA 3072
WholesalePOS release certificate.

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
