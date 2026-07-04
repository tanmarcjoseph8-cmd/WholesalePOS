# Phase 9 - Reports

Phase 9 adds reporting for sales, profit, inventory, best sellers, cashier sales, payment summaries, and exports.

## Completed

- Added secured report overview API.
- Added daily, weekly, monthly, and custom date range support.
- Added revenue, gross profit, average sale, inventory value, and low-stock totals.
- Added best seller, cashier sales, payment summary, and inventory report sections.
- Added Excel-compatible CSV export.
- Added print-ready report HTML export for saving as PDF through the Windows print dialog.
- Added a Reports page with summary tiles, report tables, period switching, and export buttons.
- Extended packaged desktop smoke testing to verify reporting and export output after a real sale.

## Files Changed

- `backend/src/app.ts`
- `backend/src/modules/reports/report.routes.ts`
- `backend/src/modules/reports/report.schemas.ts`
- `backend/src/modules/reports/report.service.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/ui/App.tsx`
- `frontend/src/views/ReportsPage.tsx`
- `scripts/smoke-packaged-desktop.mjs`
- `docs/API.md`
- `docs/DATABASE.md`
- `docs/PHASE_9_REPORTS.md`

## Verification

Run the normal verification workflow:

```powershell
pnpm verify
pnpm desktop:package:win
pnpm desktop:smoke:win
```
