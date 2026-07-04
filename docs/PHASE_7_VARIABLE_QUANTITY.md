# Phase 7 - Variable Quantity Selling

Phase 7 adds partial selling for products measured by weight, volume, length, and count.

## Completed

- Added sale item fields for the cashier-entered quantity, cashier-entered unit, and converted base stock quantity.
- Added unit conversion for kilograms, grams, liters, milliliters, meters, centimeters, pieces, packs, cases, bundles, bottles, rolls, and custom units.
- Added package-based price calculation so a 5kg package priced at ₱300 can sell 2.5kg for ₱150.
- Updated checkout to let the cashier enter decimal quantities and select compatible units.
- Updated product creation to capture stock unit, selling unit, package size, and wholesale threshold.
- Extended packaged desktop smoke testing to stock in 5kg, sell 2500g, and verify that 2.5kg remains.

## Files Changed

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260704041511_phase7_variable_quantity/migration.sql`
- `backend/src/modules/inventory/unit-conversion.ts`
- `backend/src/modules/products/product.schemas.ts`
- `backend/src/modules/sales/sale.schemas.ts`
- `backend/src/modules/sales/sale.service.ts`
- `backend/tests/unit-conversion.test.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/views/InventoryPage.tsx`
- `frontend/src/views/PosPage.tsx`
- `scripts/smoke-packaged-desktop.mjs`
- `docs/API.md`
- `docs/DATABASE.md`
- `docs/PHASE_7_VARIABLE_QUANTITY.md`

## Verification

Run the normal verification workflow:

```powershell
pnpm verify
pnpm desktop:package:win
pnpm desktop:smoke:win
```
