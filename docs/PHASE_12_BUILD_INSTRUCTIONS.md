# Phase 12 - Build Instructions

Phase 12 provides exact commands to install dependencies, run the app, build the app, and create a Windows package.

## Install Dependencies

```powershell
pnpm install
```

## Run the Developer App

```powershell
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Open:

```text
http://localhost:5173
```

Create the owner account from the first-run setup screen.

## Run the Desktop App in Development

```powershell
pnpm desktop:dev
```

## Verify Everything

```powershell
pnpm verify
```

This runs linting, TypeScript checks, tests, and production builds.

## Build the Downloadable Windows App

```powershell
pnpm desktop:package:win
```

The zip is written here:

```text
desktop\release\WholesalePOS-0.1.0-win.zip
```

## Smoke-Test the Windows Package

```powershell
pnpm desktop:smoke:win
```

The smoke test verifies migrations, startup, setup, product creation, stock receiving, variable quantity sale, stock deduction, receipt generation, print logging, reports, exports, settings, and backup creation.

## Create a Windows Installer

```powershell
pnpm desktop:installer:win
```

Use the zip package until the installer toolchain is verified on the target build machine.

## Day-to-Day Use

1. Extract `desktop\release\WholesalePOS-0.1.0-win.zip`.
2. Open `WholesalePOS.exe`.
3. Create the owner account on the first screen.
4. Add products and stock in Inventory.
5. Sell from POS.
6. Print receipts after checkout.
7. Review Reports.
8. Use Settings to create regular backups.
