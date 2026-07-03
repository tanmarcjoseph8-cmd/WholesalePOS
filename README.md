# WholesalePOS Enterprise

WholesalePOS Enterprise is a production-grade wholesale and retail point-of-sale and inventory platform for a single primary device. The repository is organized as a full-stack TypeScript monorepo with a React frontend, Express backend, local SQLite database, Prisma ORM, local update events, and a documentation set intended for operators and developers.

## Current Milestone

Milestone 1 establishes the runnable project foundation:

- Enterprise folder structure with separate frontend, backend, database, docker, docs, tests, scripts, and uploads areas.
- Backend TypeScript API foundation with Express, Zod validation, JWT authentication services, security middleware, audit logging, Prisma integration, and local update-event wiring.
- Local SQLite schema baseline covering stores, warehouses, users, roles, permissions, products, prices, inventory movements, sales, purchase orders, customers, suppliers, sessions, and audit logs.
- Frontend React/Vite shell with responsive dashboard, dark/light theme support, API health integration, and production UI structure.
- Local persistent database file for day-to-day use without Docker or a separate database server.
- Verification scripts and starter tests for authentication and unit conversion logic.

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

4. Bootstrap the owner account:

   ```powershell
   $env:ADMIN_EMAIL="owner@example.com"
   $env:ADMIN_PASSWORD="change-this-password"
   pnpm --filter @wholesalepos/backend seed:admin
   ```

5. Start the application:

   ```bash
   pnpm dev
   ```

Frontend: `http://localhost:5173`  
Backend: `http://localhost:4000`

## Verification

Run the full local verification suite:

```bash
pnpm verify
```

The milestone commit message for the current local persistence milestone is:

```text
feat(database): use local SQLite persistence
```
