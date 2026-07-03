# Phase 6 POS Screen

Phase 6 implements the first complete checkout path.

## Completed

- Added `/api/sales` endpoints protected by `sales.manage`.
- Added transactional sale creation.
- Added receipt numbering through `ReceiptSequence`.
- Added sale item persistence through `SaleItem`.
- Added cash, GCash, and mixed payment persistence through `SalePayment`.
- Added stock deduction for each sold item.
- Added permanent `InventoryMovement` rows with type `SALE`.
- Added sale audit logging.
- Updated product browsing permissions so cashiers can search products without managing products.
- Replaced the static POS screen with product search, barcode-friendly input, cart controls, cash payment, GCash payment, mixed payment, and checkout.

## Current POS Capabilities

- Search products by barcode, SKU, name, or brand.
- Add products to cart.
- Increase or decrease quantities.
- Remove cart lines.
- Accept cash payment.
- Accept GCash payment with reference number.
- Accept mixed cash and GCash payment.
- Calculate subtotal, discount total, total, paid amount, and change.
- Deduct stock after checkout.

The next phase is Phase 7: variable quantity selling by weight, volume, length, and pieces.
