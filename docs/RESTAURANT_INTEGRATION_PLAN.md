# Restaurant Integration Plan

## Current architecture

- `Product`, `ProductBarcode`, `InventoryStock`, and `InventoryMovement` are the single catalog and inventory source for Retail and Restaurant modes.
- `HeldSale` and `HeldSaleItem` represent unpaid restaurant and non-table orders. They reference existing products and warehouses; no restaurant-specific stock table exists.
- `completeHeldSale` delegates to the normal sale checkout transaction. That transaction creates the sale, payments, inventory deductions, inventory movements, and audit record, then completes the held order and releases its tables.
- `RestaurantTable.activeOrderId` links active tables to held orders. Tables are soft-disabled rather than physically deleted.
- Socket.IO events invalidate POS, Inventory, Dashboard, Reports, and Restaurant queries after sales or inventory changes.
- `Refund`, `RefundItem`, and `RefundPayment` preserve completed-sale reversals. Refund and void services restore inventory through compensating movements while retaining the original sale and payment records.

## Stock-writing paths

1. Retail and Restaurant checkout decrease `InventoryStock` and write `InventoryMovement(type=SALE)` inside one transaction.
2. Manual stock movements, adjustments, transfers, purchase receipts, and import operations use their existing inventory services and audit logs.
3. Import rollback restores stock through compensating movements.
4. Partial refunds and full voids restore stock through permanent `RETURN` movements in the same transaction as the financial reversal and audit record.

## Incremental implementation

### Milestone A: shared catalog and reservations (implemented)

- Permit Restaurant orders to use every active product from the existing catalog, including products marked for Retail.
- Add `InventoryReservation` records tied to held orders, held-order items, products, and warehouses.
- Reserve base-unit quantities when an order becomes confirmed or enters fulfillment.
- Recalculate reservations transactionally after a reserved order's items change.
- Release reservations on cancellation and consume them during checkout.
- Expose physical, reserved, and available quantities without overwriting physical stock.
- Add `CONFIRMED` to the validated order lifecycle.

### Milestone B: safe order and table operations (implemented)

- Restore inactive tables and reject deactivation while an active order is assigned.
- Record previous and new order item values in audit metadata.
- Add backend-recorded undo for the most recent reversible item edit.
- Add transactional table transfer, order merge, and item/bill split commands with optimistic version checks.
- Preserve order and table history through audit metadata and references.

### Milestone C: completed-sale reversals (implemented)

- Implement partial refunds and full voids using the existing Refund models.
- Restore inventory with compensating `RETURN` movements that reference the refund.
- Prevent refunds beyond sold quantities and prevent duplicate full voids.
- Require reasons and dedicated permissions for void/refund operations.
- Keep the original sale and payment records immutable while recording reversal payments and audit events.

### Milestone D: interface and verification (implemented and verified)

- Extend the current Restaurant screen with reservation visibility, restore table, undo, transfer, merge, split, cancel, refund, and void controls.
- Add confirmation dialogs that explain stock and payment effects.
- Add success/error feedback and permission-aware actions.
- Add route, service, schema, transaction, idempotency, and regression tests.
- Run all migrations against a fresh SQLite database, then lint, type-check, test, build, package, and smoke-test the Windows application.

Verification completed on July 14, 2026:

- Lint and TypeScript checks passed for Backend, Frontend, and Desktop.
- Backend and Frontend test suites passed with 61 tests.
- Production builds and the Windows ZIP package completed successfully.
- All seven SQLite migrations applied to a fresh packaged database.
- The packaged runtime smoke test passed reservation, checkout, partial refund, duplicate-request protection, full void, stock restoration, custom order type, and table restore scenarios.
- Desktop browser inspection loaded a confirmed order with correct reserved availability and no console errors or horizontal control clipping.

## Compatibility constraints

- Existing Retail POS endpoints and product records remain unchanged.
- Restaurant mode remains optional and disabled by default.
- Stock is never directly corrected for an order reversal without an inventory movement and audit entry.
- Financial and stock operations use database transactions and immutable compensating records.
- Unique references and status checks make checkout, reservation consumption, voids, and refunds idempotent.
