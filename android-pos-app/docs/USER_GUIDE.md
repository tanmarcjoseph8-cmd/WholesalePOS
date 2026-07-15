# User Guide

## First start

Create the owner name, business name, login, and a PIN or password of at least
four characters. Credentials are local to this tablet. The owner can add manager
and cashier accounts under **Settings**.

## Products and inventory

Open **Inventory** to create or edit a product. A barcode is optional. Leave SKU
blank for manual entry and the app creates one automatically. Configure the
inventory unit, selling unit, conversion ratio, retail and wholesale prices,
wholesale threshold, tax, and low-stock threshold.

Use **Stock in**, **Stock out**, or **Adjust** to change a balance. Every change
creates a permanent stock movement and audit entry. The app prevents negative
available stock.

Supported units are piece, kilogram, gram, liter, milliliter, meter, centimeter,
yard, foot, case, and pack. Fractional sales use scaled integer quantities.

## Retail sale

1. Open **POS** and search by name, SKU, or barcode.
2. Tap a product, set the quantity, and review its selling unit and price.
3. Apply supported line discounts, service charge, tip, or tax.
4. Record cash, GCash, card, or other payment. Card entries record only amount
   and reference; the app never stores card numbers.
5. Complete the sale. Stock, payment, receipt, and audit records commit together.
6. Preview, save, share, or print the generated receipt.

Repeated checkout taps use the same request key and cannot create a duplicate sale.

## Restaurant

Use **Restaurant** for dine-in, walk-in, counter, takeout, pickup, delivery, and
custom order types. Add or rename tables, open an order, add products, and move,
merge, split, or cancel orders with confirmation. Tables with active orders
cannot be deactivated. Confirmed order quantities are reserved; physical stock
is deducted once, when payment completes.

## Corrections and reports

Open **Sales** to find receipts, reprint, refund, or void when the signed-in role
has permission. Refunds and voids preserve the original sale and restore stock
through compensating movements.

The dashboard, inventory, sales, and restaurant views read the same SQLite
database. Writes trigger an in-app refresh, and reopening the app reloads the
latest committed data.

## Daily close

Export the day's sales CSV, review low stock, create a full backup, and move that
backup to another trusted device or drive. Do not keep the only backup on the POS
tablet.
