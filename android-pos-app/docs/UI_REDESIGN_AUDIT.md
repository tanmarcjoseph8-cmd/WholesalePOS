# Android UI Redesign Audit

## Scope and baseline

The redesign was started on branch `feat/android-premium-ui` from commit `f9b5739`.
The pre-change suite passed 10 test files and 29 tests. The Android app was already
an offline React/TypeScript/Capacitor application backed by SQLite.

The baseline capture is in `docs/ui-redesign/before/tablet-login-webview.png`.
The API 29 emulator's native screenshot path produced GPU bands, so a development-
only WebView capture helper was used. No app data was cleared; screenshots use the
separate `.debug` application ID and a disposable local test account.

## Existing screen behavior

| Screen | Existing data and actions preserved |
| --- | --- |
| Setup and login | Creates the first owner or authenticates an existing local user with the same fields, validation, and callbacks. |
| Dashboard | Loads the same local sales, available stock, low-stock, open-order, occupied-table, and inventory-status queries. Stock rows still open the same inventory product. |
| POS | Uses the same product search, stock availability, cart quantity, discount, Cash/GCash, checkout, and receipt handlers. |
| Restaurant | Uses the same table, walk-in order, active-order, item, save, status, move, merge, split, undo, cancel, and payment handlers. |
| Inventory | Uses the same product search, editor, import, category, deactivate, stock-movement, and focused-product behavior. All fields and defaults remain present. |
| Sales | Uses the same receipt lookup, printing, refund, void, quantities, reason, and confirmation behavior. |
| Reports | Uses the same presets, custom dates, report service, PDF generation, preview, viewer, and share handlers. |
| Alerts | Uses the same unread/read/resolved state, stock-status data, mark-all-read, clear-read, search, and inventory navigation. |
| Settings | Uses the same business, notification, theme, backup, restore, export, database-health, and local-user handlers. |
| Dialogs and states | Keep the same confirmation callbacks, disabled states, errors, loading states, and empty-state conditions. |

Navigation IDs, permissions, lazy-loaded routes, Android back handling, unsaved-work
confirmation, refresh behavior, and lock behavior remain unchanged.

## Code boundary

UI files reviewed and eligible for this work:

- `src/styles.css`
- `src/ui/design-system.css`
- `src/ui/App.tsx`
- `src/ui/AuthScreen.tsx`
- `src/ui/ConfirmDialog.tsx`
- `src/ui/views/*.tsx` (reviewed; no business handlers rewritten)
- Android theme colors and Capacitor presentation colors

Business and persistence boundaries reviewed and deliberately not changed:

- `src/data/*`
- `src/domain/*`
- `src/services/*`
- `src/platform/*`
- SQLite migrations, schema, queries, and seeded values
- receipt and report PDF generation
- notification scheduling and alert transition logic
- Windows frontend, backend, desktop, and database projects

## Original UI findings

- Visual values lived in one stylesheet but lacked a complete named token scale.
- Desktop navigation had limited contrast and weak account hierarchy.
- Cards, metrics, tables, forms, status labels, and dialogs used similar weight,
  making frequently scanned operational information harder to prioritize.
- Tablet and phone navigation worked, but active-state and focus treatment could
  be clearer.
- Touch targets were mostly adequate; several icon controls and table tools needed
  a consistent 48 px target.
- Status colors needed explicit soft backgrounds so meaning did not rely on text
  color alone.
