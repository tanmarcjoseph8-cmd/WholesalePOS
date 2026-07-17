# WholesalePOS Enterprise

WholesalePOS Enterprise is a production-grade wholesale and retail point-of-sale and inventory platform for a single primary device. The repository is organized as a full-stack TypeScript monorepo with a React frontend, Express backend, Electron desktop shell, local SQLite database, Prisma ORM, local update events, and a documentation set intended for operators and developers.

## Current Milestone

The app now supports a practical single-device POS workflow:

- First-run owner setup, secure login, roles, and protected screens.
- Product, inventory, stock adjustment, stock history, and low-stock controls.
- Advanced Excel/CSV inventory import with drag and drop, spreadsheet paste, manual grid entry, column mapping presets, backend preview, batch history, reports, duplicate protection, and safe rollback.
- Optional Restaurant and Hybrid modes with table status, joined tables, walk-in/takeout/pickup/delivery orders, held orders, employee edit locks, item notes, and atomic checkout through the same stock ledger as Retail POS.
- Shared Retail/Restaurant stock reservations, bill split/merge, reversible order edits, table restoration, and audited sale refunds/voids.
- Low-stock reorder list with suggested reorder quantities.
- POS checkout with barcode/search input, decimal quantities, cash, GCash, and mixed payments.
- Variable quantity selling such as grams from kilogram stock, milliliters from liter stock, or yards from meter stock.
- Receipt preview, receipt barcode output, Windows print dialog support, ESC/POS payload generation, and print logs.
- Daily, weekly, and monthly reports with sales, profit, inventory, best sellers, cashiers, payments, and exports.
- Business, tax, receipt, printer, theme, manual backup, backup history, and managed restore settings.
- Local SQLite persistence under the user's application data folder in the packaged app.

## Quick Start

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy environment values:

   ```bash
   cp .env.example .env
   ```

3. Generate Prisma client and create the local database:

   ```bash
   pnpm db:generate
   pnpm db:migrate
   ```

   The app stores day-to-day data in `database/wholesalepos.sqlite`.

4. Start the application:

   ```bash
   pnpm dev
   ```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:4000`

On first run, create the owner account from the app screen.

## Desktop App

Build and open the local desktop shell:

```bash
pnpm desktop:dev
```

Build a downloadable Windows zip package:

```bash
pnpm desktop:package:win
```

The desktop app stores its day-to-day database under the user's application data folder, not in the Git repository.

On a fresh desktop install, the app opens to an owner setup screen. Create the owner account there, then use Inventory, POS, Reports, and Settings. Products, sales, stock, receipts, settings, and backups are saved locally and remain after the app is closed.

To use restaurant operations, open Settings, choose `Restaurant` or `Hybrid`, save, and open Restaurant from the navigation. Every active product in the existing catalog is available without duplication.

## Verification

Run the full local verification suite:

```bash
pnpm verify
```

Smoke-test the packaged Windows app:

```bash
pnpm desktop:smoke:win
```

## Offline Android Licensing

The independent Android edition now uses signed, device-bound offline
activation. The private Windows License Manager stores its customer database and
P-256 signing authority in a password-encrypted vault; Android contains only the
public verification key. See [License Manager](license-manager/README.md) and
[Android activation](android-pos-app/docs/LICENSE_ACTIVATION.md) for the owner
workflow, backup requirements, and offline revocation limitation.
