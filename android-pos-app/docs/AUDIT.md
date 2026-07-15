# Windows Application Audit

## Protected baseline

- Branch: `main`
- Commit: `0e88b7bf0d3ce36630a43c42cf1f7d4a7f796462`
- Existing untracked content before Android work: `graphify-out/`
- Protection rule: all Android source, configuration, dependencies, native files, tests, and documentation live under `android-pos-app/`.

## Current Windows architecture

| Area | Windows implementation | Android decision |
| --- | --- | --- |
| User interface | React 19, TypeScript, Vite, responsive CSS, Lucide icons | Recreate in the isolated project with tablet-first navigation and touch targets |
| HTTP API | Express routes and Zod validation | Replace with direct typed application services; no listening network server |
| Persistence | Prisma 6 with SQLite and migration folders | Replace with Capacitor SQLite and ordered SQL migrations |
| Desktop shell | Electron main process starts Node, migrations, backend, and browser window | Replace with Capacitor Android lifecycle and native plugins |
| Realtime | Socket.IO invalidates browser queries | Replace with an in-process event store; every write refreshes subscribed local views |
| Authentication | JWT sessions and bcrypt passwords | Replace with local PBKDF2 password/PIN hashes and local role checks |
| Printing | Browser/Windows print and ESC/POS payloads | Use receipt preview, PDF/share adapter, and an isolated printer interface |
| Files | Node filesystem for backup, restore, imports, exports | Use Android Storage Access Framework through Capacitor file picker/filesystem/share APIs |
| Updates | Electron updater / Windows archive | Android APK update preserving app data and migration versioning |

## Business rules retained

- Products may have a barcode or an automatically generated SKU.
- Inventory is represented by stock balances plus permanent stock movements.
- Variable quantity sales convert sold units into base inventory quantities.
- A sale, payments, stock deductions, movements, receipt numbering, and audit entry commit in one SQLite transaction.
- A request key prevents duplicate checkout after repeated taps or app lifecycle interruptions.
- Confirmed restaurant orders reserve stock; physical stock is deducted only at payment.
- Cancelling an unpaid order releases reservations without reducing physical stock.
- Refunds and voids preserve the original sale and restore stock through compensating return movements.
- Products, tables, users, and financial records use soft deletion where history must remain recoverable.

## Android compatibility risks

- Prisma's binary query engine, Node, Express, Socket.IO, Electron, `fs`, and `Buffer`-based printing cannot run as the Android application runtime.
- Browser `window.open()` receipt printing is not a dependable Android printing path.
- Android file URIs are content URIs and cannot be treated as normal filesystem paths.
- Application pause, Android back navigation, repeated touch input, process death, and interrupted file imports need explicit handling.
- SQLite plugin upgrades must be tested against existing databases; startup must never drop or recreate operational tables.

## Database scope

The Android schema covers users, roles, settings, categories, products, barcodes, warehouses, stock balances, stock movements, restaurant tables, open orders, order items, inventory reservations, sales, sale items, payments, refunds, refund items, receipt sequences, audit logs, and migration history. Records use text UUIDs, ISO timestamps, integer centavos for money, and scaled decimal quantities to avoid floating-point drift.

