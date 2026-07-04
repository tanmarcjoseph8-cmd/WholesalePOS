# Phase 8 - Receipts and Printing

Phase 8 adds receipt generation, barcode output, print logging, Windows print dialog support, and ESC/POS command payload generation.

## Completed

- Added a secured receipt API for completed sales.
- Added 58mm and 80mm receipt formatting.
- Added receipt barcode SVG output using the saved receipt number as the barcode data.
- Added print-ready receipt HTML for Windows printer dialogs.
- Added ESC/POS base64 command payload generation for thermal printer integrations.
- Added permanent `ReceiptPrintLog` records for every print request.
- Updated the POS checkout flow to show the receipt after a successful sale and open the print dialog.
- Extended packaged desktop smoke testing to generate a receipt and record a print request.

## Files Changed

- `backend/src/app.ts`
- `backend/src/modules/receipts/receipt.routes.ts`
- `backend/src/modules/receipts/receipt.schemas.ts`
- `backend/src/modules/receipts/receipt.service.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/views/PosPage.tsx`
- `scripts/smoke-packaged-desktop.mjs`
- `docs/API.md`
- `docs/DATABASE.md`
- `docs/PHASE_8_RECEIPTS_PRINTING.md`

## Verification

Run the normal verification workflow:

```powershell
pnpm verify
pnpm desktop:package:win
pnpm desktop:smoke:win
```
