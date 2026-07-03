# WholesalePOS Enterprise

WholesalePOS Enterprise is a production-grade wholesale and retail point-of-sale and inventory platform for a single primary device. The repository is organized as a full-stack TypeScript monorepo with a React frontend, Express backend, Electron desktop shell, local SQLite database, Prisma ORM, local update events, and a documentation set intended for operators and developers.

## Current Milestone

The current milestone makes the desktop app usable for first-run local inventory work:

- First-run owner account setup from the app window.
- Secure login with locally persisted session state.
- Product creation and searchable product list in Inventory.
- Local SQLite persistence under the user's application data folder.
- Packaged Windows desktop runtime with Prisma's standalone query engine.
- Verification scripts and smoke-tested Windows zip packaging.

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

4. Bootstrap the owner account for local development:

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

On a fresh desktop install, the app opens to an owner setup screen. Create the owner account there, then use Inventory to add products. Products are saved locally and remain after the app is closed.

## Verification

Run the full local verification suite:

```bash
pnpm verify
```

The milestone commit message for the current usable desktop milestone is:

```text
feat(desktop): add first-run setup and product inventory
```
