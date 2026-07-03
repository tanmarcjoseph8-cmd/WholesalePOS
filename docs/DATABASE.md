# Database Documentation

The Prisma schema in `backend/prisma/schema.prisma` is the source of truth.

## Permanent Records

- `InventoryMovement` records every stock-changing event.
- `Sale`, `SaleItem`, and `SalePayment` preserve recoverable sale history.
- `AuditLog` records authentication and sensitive business actions.
- `PriceHistory` records product price changes.

## Soft Deletes

Operational entities include `deletedAt` and are filtered at the service layer.

## Inventory Safety

Stock-changing service methods must run inside database transactions and write both the balance update and the permanent movement row together.
