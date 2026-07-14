# Restaurant Operations

## Enable the Workspace

1. Sign in as the owner or an administrator.
2. Open Settings and choose `Restaurant` or `Hybrid` business mode.
3. Enable the required table, walk-in, takeout, and delivery options, then save.
4. Mark menu products as `Restaurant` or `Both` in Inventory.
5. Open Restaurant from the navigation.

Retail mode remains unchanged. The Restaurant navigation and API operations are unavailable while the business mode is Retail.

## Tables

Use Add table to create the dining layout. Each table stores a unique number, section, capacity, notes, live status, guest count, employee, and active order. Opening an available table creates a held dine-in order. Select several tables in the order editor and choose one primary table to join them. Moving an order releases tables that are no longer selected.

After payment, assigned tables move to Cleaning. Select Mark ready when cleanup is finished. Tables with an active order cannot be disabled or reset to Available.

## Orders

Use New order for walk-in, counter, takeout, pickup, or delivery service. Dine-in orders are normally opened from the table layout. The system generates durable numbers with `DINE`, `WALK`, `TAKE`, or `DEL` prefixes.

Open an order to acquire its edit lease. Another employee cannot edit it until the current employee selects Hold, completes the order, or the two-minute lease expires. Every save uses an optimistic version; when another session changed the order, reload before editing again.

Restaurant products can be searched and added to the order. Quantity uses the product selling unit and supports the same weight, volume, length, and count conversions as Retail POS. Item notes are saved with each active line. Status progresses from Draft or Open through Preparing, Ready, and Served.

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
