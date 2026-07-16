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

The **Product activity** tracker at the bottom of Inventory combines product
creation, edits, deactivation, restocks, removals, counted adjustments, sales,
returns, and imported starting stock. Use **All**, **Products**, or **Stock** to
filter the history. Each event shows the product, signed quantity change, user,
reason, source, and local date and time. Product removal is a reversible soft
deactivation, so its history and past sales remain intact.

Supported units are piece, kilogram, gram, liter, milliliter, meter, centimeter,
yard, foot, case, and pack. Fractional sales use scaled integer quantities.

## Retail sale

1. Open **Cash Drawer**, count the starting float, and choose **Open drawer**.
2. Open **POS** and search by name, SKU, or barcode.
3. Tap a product, set the quantity, and review its selling unit and price.
4. Apply supported line discounts, service charge, tip, or tax.
5. Record cash, GCash, card, or other payment. The payment panel immediately
   shows the amount still due or the change to return. For example, a PHP 40.00
   sale paid with PHP 100.00 displays PHP 60.00 change.
6. Complete the sale. Stock, payment, receipt, cash ledger, and audit records commit together.
7. The saved receipt opens automatically after checkout. Review its items,
   payment methods, amount received, and change, then choose **Print receipt**.

Repeated checkout taps use the same request key and cannot create a duplicate sale.
Cash payments and cash refunds require an open drawer. GCash-only transactions do
not. The cash ledger records only money retained after customer change.

## Restaurant

Use **Restaurant** for dine-in, walk-in, counter, takeout, pickup, delivery, and
custom order types. Add or rename tables, open an order, add products, and move,
merge, split, or cancel orders with confirmation. Tables with active orders
cannot be deactivated. Confirmed order quantities are reserved; physical stock
is deducted once, when payment completes. Restaurant payments use the same live
amount-due and change calculation, and automatically open the completed receipt.

## Corrections and reports

Open **Sales** to find receipts, reprint, refund, or void when the signed-in role
has permission. Refunds and voids preserve the original sale and restore stock
through compensating movements.

The dashboard, inventory, sales, and restaurant views read the same SQLite
database. Writes trigger an in-app refresh, and reopening the app reloads the
latest committed data.

In portrait orientation, supported tablets automatically switch to the mobile
header and bottom navigation and use the full screen width. Landscape restores
the wider tablet layout when space permits.

Open **Reports** for today, this week, this month, previous periods, or a custom
date range. Reports use the business timezone configured in **Settings** and use
only finalized local sales. Review summaries, payment and order-type breakdowns,
best sellers, and optional transaction details. Generate a PDF, preview it with
an installed PDF viewer, or use Android Share to save, send, or print it.

The Dashboard **Products needing stock** list names every product currently low
or out of stock and shows its exact available quantity, unit, warehouse, and
threshold. Managers and owners can tap a product to open it directly in
Inventory. Cashiers see the same specific stock details as a read-only list.
New in-app alert messages name up to three affected products and show how much
remains; the Alerts screen keeps the complete list when more products are
affected at once.

Open **Alerts** to review unread and historical low-stock or out-of-stock events.
Each entry identifies the product, exact available quantity and unit, threshold,
warehouse, and status. Opening an alert marks it read; managers and owners also
open the affected Inventory item, while cashiers remain in the read-only Alerts
screen. Use **Mark all read** or **Clear read** as needed. Clearing hides
notification history but does not remove products, stock movements, or current
stock status. Restocking an item returns it to normal; if it later crosses the
threshold again, a new alert is created.

## Daily close

Open **Cash Drawer**, record any documented cash in or cash out, and choose
**Close drawer**. Count denominations or enter the actual cash total. The app
compares actual cash with opening cash plus cash sales, minus cash refunds, plus
cash in, minus cash out. A non-zero difference is permanently marked for manager
review. Then export the day's sales report, review low stock, create a full
backup, and move that backup to another trusted device or drive. Do not keep the
only backup on the POS tablet.

Cashiers see and close only their own drawer sessions. They can review the exact
products that are low or out of stock from the Dashboard and Alerts screens, but
cannot open Inventory from those lists. The Inventory screen, product
edit/deactivate controls, stock adjustment form, Settings, and Reports are not
shown in Cashier mode. Product search remains available in POS and Restaurant so
cashiers can sell active stock. Inventory and catalog write services
independently enforce management permission.
