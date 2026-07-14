# Advanced Import And Restaurant Upgrade

## Architecture Summary

The upgrade extends the existing single-device WholesalePOS application. It does not create a second product catalog, inventory ledger, sales database, payment system, receipt system, or reporting pipeline.

The existing modules remain authoritative:

- `Product` and `ProductBarcode` identify every retail and restaurant item.
- `InventoryStock` stores current stock by warehouse.
- `InventoryMovement` permanently records every stock change.
- `Sale`, `SaleItem`, and `SalePayment` store completed retail and restaurant sales.
- Receipt and report services continue reading completed sales.
- `Setting` stores store-level mode and workflow configuration.
- `AuditLog` records sensitive changes.

## Phase 1 Foundation

Phase 1 adds backward-compatible foundations:

- Business modes: `RETAIL`, `RESTAURANT`, and `HYBRID`.
- Product channels: `RETAIL`, `RESTAURANT`, and `BOTH`.
- Optional product variants for deterministic import matching.
- Sale order types: `RETAIL`, `DINE_IN`, `TAKEOUT`, `DELIVERY`, and `WALK_IN`.
- Optional sale order numbers, service charges, and tips.
- Inventory import defaults and restaurant settings.
- Permission keys for imports, rollback, tables, orders, cancellation, split bills, discounts, and reopening.

Existing products and sales receive `RETAIL` defaults. Existing stored settings are merged with safe defaults when read, so old databases remain valid.

## Phase 2 Advanced Inventory Import

The advanced import module will own file fingerprinting, backend validation, matching candidates, preview results, confirmation, transactional batch execution, history, reports, and safe rollback. The frontend will provide file upload, drag and drop, clipboard paste, manual grid entry, template export, column mapping, row editing, filtering, and confirmation.

Product matching will use this order:

1. Product ID.
2. Exact SKU.
3. Exact barcode.
4. Exact normalized product name and variant.
5. Exact normalized product name as a manual-review candidate.

Uncertain matches will never be merged automatically.

## Phase 3 Restaurant Orders

Restaurant tables and active orders will be operational records only. Order items will reference existing products. Checkout will call the same sale and inventory transaction used by Retail mode.

Retail mode will not display restaurant navigation or controls. Restaurant and Hybrid modes will expose enabled order types and table features according to store settings.

## Phase 4 Integration

Kitchen tickets, table transfers, split and partial payments, restaurant receipt fields, and restaurant report dimensions will extend the active-order and completed-sale models. Product-based add-ons remain normal products. Preparation notes never affect inventory.

## Compatibility Rules

- Migrations are additive and preserve existing IDs and records.
- Retail checkout defaults remain unchanged.
- Restaurant sales must create the same inventory movements as retail sales.
- Import stock changes must use inventory transactions and audit records.
- Import rollback must refuse unsafe reversal when later stock activity depends on the imported balance.
- The packaged desktop app continues running migrations before backend startup.
