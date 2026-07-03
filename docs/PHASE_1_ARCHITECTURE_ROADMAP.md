# Phase 1 Architecture And Roadmap

WholesalePOS is an offline Windows desktop POS for one computer. The app uses Electron for the desktop shell, React and TypeScript for the interface, an Express backend running locally on `127.0.0.1`, Prisma ORM, and a local SQLite database stored on disk so business data remains after the app is closed.

This plan continues from the existing repository. The current code already includes the monorepo structure, Electron shell, local backend startup, SQLite migrations, first-run owner setup, login, product creation, and a basic inventory list. Future phases extend those foundations instead of replacing them.

## Product Scope

The finished app must support a real wholesale and retail store on a single Windows device:

- Offline-only local operation with no cloud dependency.
- Philippine Peso currency formatting.
- Admin and cashier users with role permissions.
- Product catalog with barcode, SKU, category, brand, supplier, prices, stock rules, expiration, image, and notes.
- Inventory receiving, removal, adjustment, history, low-stock alerts, and out-of-stock alerts.
- POS selling screen with barcode input, search, cart, VAT, discounts, cash, GCash, and mixed payments.
- Variable quantity selling for weight, volume, length, pieces, boxes, cases, and custom units.
- Receipt numbering, receipt barcode, Windows printer support, and ESC/POS support.
- Reports for sales, profit, inventory, cashiers, payment types, best sellers, and exports.
- Settings for business details, tax, receipt layout, printer, theme, backup, and restore.
- Audit logs for authentication, inventory, prices, sales, refunds, settings, and backup actions.

## Target Folder Structure

The repository will keep the existing professional monorepo layout and expand it in-place:

```text
WholesalePOS/
  backend/
    prisma/
      migrations/
      schema.prisma
    src/
      config/
      middleware/
      modules/
        auth/
        backup/
        barcodes/
        customers/
        health/
        inventory/
        payments/
        printing/
        products/
        reports/
        sales/
        settings/
        suppliers/
        users/
      realtime/
      scripts/
      shared/
      types/
  database/
  desktop/
    src/
    app-assets/
    release*/
  docker/
  docs/
  frontend/
    src/
      components/
      features/
        auth/
        dashboard/
        inventory/
        pos/
        reports/
        settings/
      lib/
      routes/
      ui/
      views/
  scripts/
  tests/
  uploads/
    products/
    settings/
    receipts/
    backups/
```

## Application Architecture

### Desktop Layer

Electron starts the local backend, runs Prisma migrations, serves the built frontend, and opens the app window. The packaged app bundles a Node runtime and Prisma's Windows query engine so the database works without installing development tools.

Desktop responsibilities:

- Start and stop the local backend.
- Choose a free local port.
- Create persistent app data directories.
- Run database migrations on startup.
- Store local logs under the user's app data folder.
- Package runtime assets for Windows zip and installer builds.

### Backend Layer

The backend is the only layer allowed to read or write the database. Frontend screens call backend APIs for all business operations.

Backend responsibilities:

- Authentication, sessions, roles, and permissions.
- Validation with Zod for every request.
- Prisma transactions for every sale and inventory update.
- Permanent movement and audit records.
- Local update events after successful changes.
- Receipt data generation and printing adapters.
- Report queries and export generation.
- Backup and restore operations.

### Frontend Layer

The frontend provides the cashier/admin interface. It must be responsive, keyboard-friendly, barcode-scanner-friendly, and fast on lower-end Windows machines.

Frontend responsibilities:

- First-run setup and login.
- Protected screens based on role permissions.
- Inventory management forms and tables.
- POS workflow optimized for keyboard and barcode scanner input.
- Checkout, receipt preview, and print actions.
- Reports and settings screens.
- Dark/light theme and local UI preferences.

## Database Tables

The current schema already includes several foundation tables. The full app will use and expand the following tables.

### Existing Or In Progress

- `Store`: business/store identity and currency.
- `Warehouse`: local stock location, with a default main warehouse.
- `Role`: admin/cashier/owner role records.
- `Permission`: permission keys for protected actions.
- `RolePermission`: role-to-permission join table.
- `User`: staff accounts with hashed passwords.
- `Session`: refresh token sessions.
- `Supplier`: supplier records.
- `Customer`: customer records.
- `Category`: product categories.
- `Product`: product catalog and pricing fields.
- `ProductBarcode`: one or more barcodes per product.
- `InventoryStock`: current stock balance by product and warehouse.
- `InventoryMovement`: permanent stock movement history.
- `PriceHistory`: price-change audit trail.
- `Sale`: recoverable sale header.
- `SaleItem`: sale line items.
- `SalePayment`: cash, GCash, and mixed payment entries.
- `PurchaseOrder`: supplier ordering foundation.
- `PurchaseOrderItem`: purchase order lines.
- `AuditLog`: security and business activity history.

### Tables To Add Or Expand

- `Setting`: typed key/value settings for business, tax, receipt, printer, theme, and backup preferences.
- `ReceiptSequence`: receipt numbering state to prevent duplicate receipt numbers.
- `ReceiptPrintLog`: print attempts, printer target, success/failure, and reprint audit.
- `HeldSale`: suspended POS carts.
- `HeldSaleItem`: suspended cart line items.
- `Refund`: refund header tied to original sale when applicable.
- `RefundItem`: refunded quantities and amounts.
- `BarcodeLabelBatch`: generated barcode label print batches.
- `BackupRun`: manual and automatic backup history.
- `UploadedAsset`: stored local image/QR/receipt assets.
- `CashDrawerSession`: opening/closing cash counts by cashier.
- `StockAlert`: generated low-stock and out-of-stock alert states.

## Core Modules

### Authentication And Users

Current foundation exists. Remaining work is admin/cashier user management, permission checks in the frontend, cashier role defaults, account status controls, password reset by admin, and audit views.

### Products And Inventory

Current product creation exists. Remaining work is edit product, soft delete, category/supplier pickers, image support, wholesale threshold pricing, add stock, remove stock, adjustments, stock history, alerts, and inventory valuation.

### POS And Sales

This module will create a complete checkout flow. It must support barcode scanner entry, manual search, cart edits, variable quantity, retail/wholesale price selection, discounts, VAT, cash, GCash, mixed payment, held transactions, and recoverable completed sales.

### Variable Quantity

Products must store base unit, selling unit, package size, and conversion ratio. Sale calculations must use Decimal-safe math, and stock deductions must match the exact sold quantity in the base inventory unit.

### Receipts And Printing

Receipt generation must produce a stable receipt model from sale data. Printing will support Windows printer output first, then ESC/POS thermal commands for 58mm and 80mm receipts.

### Reports

Reports must query stored sales and inventory records, not frontend state. Required outputs include sales totals, gross profit, cashier totals, payment summaries, GCash summaries, best sellers, slow sellers, inventory value, and PDF/Excel export.

### Backup And Settings

Settings will store business identity, receipt fields, VAT/tax behavior, printer settings, theme, GCash QR path, and backup schedule. Backup must copy the SQLite database and related uploaded assets. Restore must validate the selected backup before replacing active data.

## Implementation Roadmap

### Phase 1: Planning

Create the architecture, folder structure target, database table plan, module boundaries, and implementation roadmap. No runtime behavior changes.

### Phase 2: Project Setup

Confirm and complete Electron, React, TypeScript, TailwindCSS, SQLite, Prisma, scripts, startup files, packaged runtime assets, and developer commands. Keep the app runnable.

### Phase 3: Database

Complete the Prisma schema for all required POS, inventory, settings, backup, receipt, reports, and audit data. Add migrations and verify SQLite migration success.

### Phase 4: Authentication

Finish admin/cashier login, role management, permission enforcement, protected frontend routes, session refresh behavior, user management, and audit records.

### Phase 5: Inventory

Implement full product management, category/supplier support, stock receiving, stock removal, adjustments, movement history, low-stock alerts, out-of-stock alerts, and valuation.

### Phase 6: POS Screen

Implement barcode input, product search, cart, quantity controls, discounts, VAT, cash payment, GCash payment, mixed payment, held transactions, and completed sale persistence.

### Phase 7: Variable Quantity Selling

Implement package size and unit conversion selling for kilograms, grams, liters, milliliters, meters, centimeters, pieces, boxes, cases, and custom units. Ensure stock deducts proportionally.

### Phase 8: Receipts And Printing

Implement receipt generation, receipt numbering, receipt barcode, receipt preview, Windows printing, ESC/POS printing, and print logs.

### Phase 9: Reports

Implement daily, weekly, monthly, annual, profit, inventory, best seller, cashier, payment, GCash, wholesale, retail, PDF, and Excel reports.

### Phase 10: Backup And Settings

Implement business settings, tax settings, receipt settings, printer settings, theme settings, GCash QR storage, manual backup, automatic backup, and restore.

### Phase 11: Testing And Fixing

Review the full codebase, fix broken imports, TypeScript errors, runtime errors, migration issues, packaging issues, and missing coverage. Verify the app runs as a Windows desktop app.

### Phase 12: Build Instructions

Document exact commands for installing dependencies, running development mode, packaging the desktop app, creating a Windows installer, backing up data, and restoring data.

## Verification Rules For Every Phase

Every implementation phase must end with:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- Prisma migration verification when the database changes.
- Desktop startup or packaged smoke test when desktop behavior changes.
- Documentation updates.
- A logical git commit message.

## Current Baseline

The repository currently has:

- Electron desktop shell.
- Local backend startup.
- SQLite and Prisma migration baseline.
- First-run owner setup.
- Login session storage.
- Product creation and searchable inventory product list.
- Packaged Windows zip smoke-tested for owner setup and product persistence.

The next command should be `Continue to Phase 2` when you want me to proceed.
