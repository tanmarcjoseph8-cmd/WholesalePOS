# WholesalePOS Enterprise

WholesalePOS Enterprise is a production-grade wholesale and retail point-of-sale and inventory platform. The repository is organized as a full-stack TypeScript monorepo with a React frontend, Express backend, PostgreSQL database, Prisma ORM, Docker support, realtime events, and a documentation set intended for operators and developers.

## Current Milestone

Milestone 1 establishes the runnable project foundation:

- Enterprise folder structure with separate frontend, backend, database, docker, docs, tests, scripts, and uploads areas.
- Backend TypeScript API foundation with Express, Zod validation, JWT authentication services, security middleware, audit logging, Prisma integration, and Socket.IO wiring.
- PostgreSQL schema baseline covering stores, warehouses, users, roles, permissions, products, prices, inventory movements, sales, purchase orders, customers, suppliers, sessions, and audit logs.
- Frontend React/Vite shell with responsive dashboard, dark/light theme support, API health integration, and production UI structure.
- Docker Compose for PostgreSQL, backend, and frontend.
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

3. Start PostgreSQL:

   ```bash
   docker compose -f docker/docker-compose.yml up -d postgres
   ```

4. Generate Prisma client and run migrations:

   ```bash
   pnpm db:generate
   pnpm db:migrate
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

The milestone commit message for this foundation is:

```text
feat(project): establish enterprise POS foundation
```
