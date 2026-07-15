# Verification Report

Verified through 16 July 2026.

## Automated checks

- ESLint: passed.
- Strict TypeScript project build: passed with no errors.
- Vitest: 4 files, 11 tests passed for calculations, security, migrations, and
  legacy WebView compatibility.
- Vite production build targeting Chrome 61-era WebView syntax: passed.
- Capacitor Android sync: passed.
- Gradle native unit test: passed.
- Android 10 instrumentation test confirming no internet permission: passed.
- Gradle debug APK, signed release APK, and signed release AAB: passed.
- Release APK signature: APK Signature Scheme v2, RSA 3072.
- Manifest: minimum API 28, target API 36, no `INTERNET` permission.
- Every packaged Capacitor plugin declares support for API 24 or newer.

## Android 10 emulator

- Signed release APK installed and launched with Wi-Fi and mobile data disabled.
- First-run SQLite migrations completed.
- Owner setup completed without internet.
- Forced process stop and restart returned to the unlock screen, proving local
  account data persisted.
- `adb install -r` update succeeded and the existing account remained.
- Version 0.1.1 installed over 0.1.0, retained the `FireOwner` account, and
  successfully unlocked to the dashboard with networking disabled.
- The app reported the local database as healthy.
- No fatal Android process or uncaught JavaScript error remained in the final run.

The emulator found and drove the fix for Android 10 WebView support:
`crypto.randomUUID()` now has a secure `crypto.getRandomValues()` UUID fallback.
Version 0.1.1 also installs compatibility implementations for `replaceAll` and
`Object.fromEntries` before the React application starts on older WebViews.

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
