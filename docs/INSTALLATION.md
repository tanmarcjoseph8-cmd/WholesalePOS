# Installation Guide

## Requirements

- Node.js 22 or newer
- pnpm 11 or newer
- Docker Desktop
- PostgreSQL 17 when not using Docker

## Local Setup

```bash
pnpm install
cp .env.example .env
docker compose -f docker/docker-compose.yml up -d postgres
pnpm db:generate
pnpm db:migrate
pnpm dev
```

Use strong JWT secrets before running outside a local development machine.

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
