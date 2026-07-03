# Database

The database uses PostgreSQL with Prisma migrations owned by the backend package.

Core rules enforced by design:

- Business records use `createdAt`, `updatedAt`, and `deletedAt` where lifecycle changes are expected.
- Inventory changes are append-only through `InventoryMovement`.
- Sales preserve item and payment details for recovery and reporting.
- Price changes are captured in `PriceHistory`.
- Login success and failure events are captured in `AuditLog`.
- Large lookup paths are indexed for pagination, filtering, and reports.

Run migrations from the repository root:

```bash
pnpm db:migrate
```
