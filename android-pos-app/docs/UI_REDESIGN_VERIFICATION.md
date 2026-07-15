# UI Redesign Verification

## Automated results

| Check | Before | After |
| --- | --- | --- |
| ESLint | Pass | Pass |
| TypeScript project build | Pass | Pass |
| Vitest | 10 files, 29 tests passed | 10 files, 29 tests passed |
| Vite production build | Pass | Pass |
| Android debug APK | Pass | Pass |

The production bundle keeps route-level lazy loading. CSS increased to about 42 KB
uncompressed and 8 KB gzip; no image, font, analytics, or runtime dependency was
added. Presentation transitions are short and do not delay commands.

## Functional equivalence checklist

- [x] Existing button handlers and callback parameters are unchanged.
- [x] Existing form fields, defaults, validation attributes, and submit handlers are unchanged.
- [x] Existing route IDs, permission filtering, and Android back handling are unchanged.
- [x] Sales, discounts, tax, payment, quantity, inventory, and order calculations are unchanged.
- [x] Database schema, migrations, queries, stored values, and local-storage behavior are unchanged.
- [x] Offline startup and SQLite initialization are unchanged.
- [x] Receipt and report calculations, PDF content, and export handlers are unchanged.
- [x] Notification thresholds, transitions, deduplication, and read state are unchanged.
- [x] Activation/licensing behavior is unchanged; this Android edition has no new licensing flow.
- [x] Windows application files are unchanged.

## Screenshots

Baseline:

- `docs/ui-redesign/before/tablet-login-webview.png`

Redesigned:

- `docs/ui-redesign/after/tablet-login.png`
- `docs/ui-redesign/after/phone-login.png`
- `docs/ui-redesign/after/tablet-dashboard.png`
- `docs/ui-redesign/after/tablet-pos.png`
- `docs/ui-redesign/after/tablet-restaurant.png`
- `docs/ui-redesign/after/tablet-inventory.png`
- `docs/ui-redesign/after/tablet-sales.png`
- `docs/ui-redesign/after/tablet-reports.png`

## Visual test limitation

The bundled API 29 emulator WebView intermittently aborts in its Chromium GPU
process with `SkGlyph: Unknown mask format` after repeated canvas screenshots.
This is an emulator renderer defect: database initialization, authentication, and
screen queries complete first, and debug/release compilation is unaffected. Native
screenshot capture on that emulator also produces GPU bands. Matching screenshots
were therefore captured from the live Android WebView with a development-only CDP
and html2canvas helper. Phone and tablet login layouts and the major authenticated
tablet screens were visually inspected; alerts and settings use the same verified
tokens and responsive shell but could not be repeatedly canvas-captured in that
legacy emulator session.
