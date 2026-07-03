# Phase 2 Project Setup

Phase 2 confirms and hardens the existing Electron, React, TypeScript, SQLite, and Prisma setup. The project remains a monorepo and continues from the existing working app.

## Completed Setup

- Root workspace uses `pnpm` with separate `frontend`, `backend`, `desktop`, and `tests` packages.
- Frontend uses React, TypeScript, Vite, TailwindCSS, React Query, React Router, Zod, and Lucide icons.
- Backend uses Node.js, Express, TypeScript, Prisma, SQLite, Zod validation, JWT auth, Helmet, CORS, rate limits, and Socket.IO.
- Desktop uses Electron and electron-builder.
- Prisma uses SQLite with the binary engine for reliable packaged Windows operation.
- Desktop startup runs migrations, starts the local backend, serves the built frontend, and opens the app window.
- The Windows package bundles a Node runtime and Prisma runtime files.
- A packaged smoke-test script verifies the built app can run migrations, start the backend, create the owner account, create a product, and read it back.

## Main Commands

Install dependencies:

```bash
pnpm install
```

Generate Prisma client:

```bash
pnpm db:generate
```

Run development frontend and backend:

```bash
pnpm dev
```

Run the desktop shell in development:

```bash
pnpm desktop:dev
```

Build all packages:

```bash
pnpm build
```

Package the Windows desktop zip:

```bash
pnpm desktop:package:win
```

Smoke-test the newest packaged Windows build:

```bash
pnpm desktop:smoke:win
```

Run full verification:

```bash
pnpm verify
```

## Startup Files

- `backend/src/server.ts`: starts the local HTTP API and Socket.IO server.
- `backend/src/app.ts`: configures Express middleware and API routes.
- `frontend/src/main.tsx`: mounts the React app.
- `frontend/src/ui/App.tsx`: owns the app shell, auth screen, navigation, and protected app layout.
- `desktop/src/main.ts`: starts migrations, backend, and the desktop browser window.
- `scripts/prepare-desktop-assets.mjs`: copies backend, frontend, Prisma, and Node runtime files into desktop assets.
- `scripts/smoke-packaged-desktop.mjs`: validates a packaged desktop build with a temporary database.

## Phase 2 Verification

Phase 2 is complete when these pass:

- `pnpm verify`
- `pnpm desktop:package:win`
- `pnpm desktop:smoke:win`

The next phase is Phase 3: complete the database schema and migrations.
