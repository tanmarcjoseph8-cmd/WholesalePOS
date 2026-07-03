# Installation Guide

## Requirements

- Node.js 22 or newer
- pnpm 11 or newer

Docker and PostgreSQL are not required for the normal single-device app setup.

## Local Setup

```bash
pnpm install
cp .env.example .env
pnpm db:generate
pnpm db:migrate
pnpm dev
```

The database is created at `database/wholesalepos.sqlite`. Keep that file backed up because it contains the shop's day-to-day data.

Use strong JWT secrets before running with real business data.

## Desktop App Setup

The desktop shell starts the backend locally, runs migrations, opens the built frontend in an app window, and stores the live database under the user's application data folder.

```bash
pnpm desktop:dev
```

Create a downloadable Windows zip package:

```bash
pnpm desktop:package:win
```

The package output is written to `desktop/release/`. A separate NSIS installer command is available as `pnpm desktop:installer:win` for the later signed-installer milestone.

## Bootstrap Owner Account

After migrations complete, create the first owner account:

```bash
ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD=change-this-password pnpm --filter @wholesalepos/backend seed:admin
```

PowerShell:

```powershell
$env:ADMIN_EMAIL="owner@example.com"
$env:ADMIN_PASSWORD="change-this-password"
pnpm --filter @wholesalepos/backend seed:admin
```

Use a unique password with at least 12 characters. The bootstrap script creates the main store, main warehouse, owner role, baseline permissions, and an audited owner user.
