# Verification Report

Verified on 15 July 2026.

## Automated checks

- ESLint: passed.
- Strict TypeScript project build: passed with no errors.
- Vitest: 3 files, 9 tests passed for calculations, security, and migrations.
- Vite production build targeting Android 10 WebView compatibility: passed.
- Capacitor Android sync: passed.
- Gradle native unit test: passed.
- Android 10 instrumentation test confirming no internet permission: passed.
- Gradle debug APK, signed release APK, and signed release AAB: passed.
- Release APK signature: APK Signature Scheme v2, RSA 3072.
- Manifest: minimum API 29, target API 36, no `INTERNET` permission.

## Android 10 emulator

- Signed release APK installed and launched with Wi-Fi and mobile data disabled.
- First-run SQLite migrations completed.
- Owner setup completed without internet.
- Forced process stop and restart returned to the unlock screen, proving local
  account data persisted.
- `adb install -r` update succeeded and the existing account remained.
- The app reported the local database as healthy.
- No fatal Android process or uncaught JavaScript error remained in the final run.

The emulator found and drove the fix for Android 10 WebView support:
`crypto.randomUUID()` now has a secure `crypto.getRandomValues()` UUID fallback.

## Hardware acceptance still required

Before production deployment, test one complete retail sale, restaurant table
sale, refund, bulk import, backup/restore drill, barcode hardware, receipt
printing, portrait/landscape layout, app update, tablet restart, and prolonged
offline operation on the exact physical tablet and printer models.
