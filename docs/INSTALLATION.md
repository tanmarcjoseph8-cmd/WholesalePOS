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
