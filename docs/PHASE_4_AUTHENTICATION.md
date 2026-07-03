# Phase 4 Authentication

Phase 4 strengthens authentication with permission-protected APIs and a user management screen.

## Completed

- Added reusable backend `requirePermission` middleware.
- Protected product APIs with `products.manage`.
- Protected inventory APIs with `inventory.manage`.
- Added `/api/users` management endpoints protected by `users.manage`.
- Added administrator and cashier role creation support.
- Added audited user creation and user updates.
- Added frontend current-user permission loading from `/api/auth/me`.
- Added permission-filtered navigation.
- Added protected frontend routes for POS, Inventory, and Users.
- Added Users screen for creating administrator/cashier accounts and activating or deactivating users.

## Role Defaults

Administrator accounts receive:

- `dashboard.read`
- `users.manage`
- `products.manage`
- `inventory.manage`
- `sales.manage`
- `customers.manage`
- `suppliers.manage`
- `reports.read`
- `settings.manage`
- `audit.read`

Cashier accounts receive:

- `dashboard.read`
- `sales.manage`
- `customers.manage`

The owner account created during first-run setup keeps full owner permissions.

## Verification

Phase 4 must pass:

```bash
pnpm verify
pnpm desktop:package:win
pnpm desktop:smoke:win
```

The next phase is Phase 5: complete inventory workflows.
