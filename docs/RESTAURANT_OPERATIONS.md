# Restaurant Operations

## Enable the Workspace

1. Sign in as the owner or an administrator.
2. Open Settings and choose `Restaurant` or `Hybrid` business mode.
3. Enable the required table, walk-in, takeout, and delivery options, then save.
4. Confirm that the products are active in the existing POS catalog.
5. Open Restaurant from the navigation.

Retail mode remains unchanged. The Restaurant navigation and API operations are unavailable while the business mode is Retail.

## Tables

Use Add table to create the dining layout. Each table stores a unique number, section, capacity, notes, live status, guest count, employee, and active order. Opening an available table creates a held dine-in order. Select several tables in the order editor and choose one primary table to join them. Moving an order releases tables that are no longer selected.

After payment, assigned tables move to Cleaning. Select Mark ready when cleanup is finished. Tables with an active order cannot be disabled or reset to Available.

## Orders

Use New order for walk-in, counter, takeout, pickup, or delivery service. Dine-in orders are normally opened from the table layout. The system generates durable numbers with `DINE`, `WALK`, `TAKE`, or `DEL` prefixes.

Open an order to acquire its edit lease. Another employee cannot edit it until the current employee selects Hold, completes the order, or the two-minute lease expires. Every save uses an optimistic version; when another session changed the order, reload before editing again.

Every active POS product can be searched and added to the order. Quantity uses the product selling unit and supports the same weight, volume, length, and count conversions as Retail POS. Item notes are saved with each active line. Status progresses from Draft or Open through Confirmed, Preparing, Ready, and Served.

## Shared Catalog and Reservations

Restaurant orders use the same `Product`, barcode, warehouse, and inventory records as Retail POS. Draft and Open orders do not change physical stock. Confirming an order reserves its base-unit quantities. Inventory screens show physical, reserved, and available quantities.

Preparing, Ready, and Served orders retain their reservations. Cancellation or returning a Confirmed order to Open releases them. Checkout consumes reservations while the normal sale transaction deducts physical stock. Other active reservations are excluded from Retail and Restaurant availability checks.

## Recovery Operations

- Undo last item change restores the most recent saved removal or quantity edit and records the reason.
- Move / join tables transfers the active order while preserving its history.
- Merge orders moves items, tables, charges, and reservations into one target order. The source remains linked in history.
- Split bill moves selected quantities into a new unpaid order and proportionally divides charges and reservations.
- Deactivate table removes an unused table from the live layout. Inactive tables can be shown and restored.

All commands require the latest order version. A stale screen receives a conflict rather than overwriting newer work.

## Refunds and Voids

Authorized managers can refund selected sold quantities or void the remaining completed sale. A reason is mandatory. The original sale and payment records remain; the app creates a permanent refund, refund payments, refund items, and compensating `RETURN` inventory movements.

Refund quantities cannot exceed the remaining sold quantities. Request keys and sale status checks prevent duplicate stock restoration.

## Payment and Inventory

Enter Cash, GCash, or both, then select Complete payment. The app saves the latest order changes first and checks out the resulting version. Payment creates the normal sale and receipt, permanently deducts the converted quantity from `InventoryStock`, writes `InventoryMovement`, completes the held order, and moves dine-in tables to Cleaning in one database transaction.

Cancelled orders remain in closed-order history. Users with `orders.reopen` can reopen an unpaid cancelled order. A completed order cannot be reopened or charged again.

## Permissions

- `orders.manage`: view, create, hold, resume, edit, move, and advance orders.
- `tables.manage`: create, edit, change status, and disable tables.
- `orders.discount`: save order-line discounts.
- `orders.cancel`: cancel active orders with a required reason.
- `orders.reopen`: reopen unpaid cancelled orders.
- `sales.manage`: accept payment and complete checkout.
