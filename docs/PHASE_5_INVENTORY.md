# Phase 5 Inventory

Phase 5 connects inventory operations to the UI using the existing transaction-safe backend inventory services.

## Completed

- Added warehouse listing endpoint for inventory screens.
- Kept stock-changing operations in backend transactions.
- Connected Inventory UI to stock balances.
- Connected Inventory UI to stock movement history.
- Added UI workflow for adding stock.
- Added UI workflow for removing stock.
- Added UI workflow for count adjustments.
- Added UI workflow for damaged stock and returns.
- Displayed low-stock and out-of-stock status from current balances.

## Protected Endpoints

Inventory endpoints require:

- Valid bearer access token.
- `inventory.manage` permission.

## Data Integrity

Stock changes use these durable records:

- `InventoryStock` for the current balance.
- `InventoryMovement` for permanent stock history.
- `AuditLog` for who made the change and why.

The next phase is Phase 6: POS screen and checkout.
