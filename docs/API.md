# API Documentation

Base URL: `/api`

## Health

`GET /health`

Returns service status and timestamp.

## Authentication

`GET /auth/setup`

Returns whether the local database still needs its first owner account.

`POST /auth/setup`

Creates the first owner account only when no active users exist. This endpoint creates the default store, warehouse, owner role, permissions, and a signed-in session.

`POST /auth/login`

Request:

```json
{
  "email": "owner@example.com",
  "password": "strong-password",
  "rememberMe": true
}
```

Response:

```json
{
  "accessToken": "jwt",
  "refreshToken": "jwt",
  "user": {
    "id": "user-id",
    "name": "Owner",
    "email": "owner@example.com",
    "role": "Owner",
    "storeId": "store-id"
  }
}
```

Login attempts are rate limited and audited.

`POST /auth/refresh`

Rotates a valid refresh token and returns a new access token and refresh token. The previous refresh token is revoked permanently.

Request:

```json
{
  "refreshToken": "jwt"
}
```

`POST /auth/logout`

Revokes a refresh token and records an audit event.

Request:

```json
{
  "refreshToken": "jwt"
}
```

`GET /auth/me`

Requires an `Authorization: Bearer <accessToken>` header and returns the current user profile with permission keys.

## Products

All product endpoints require `Authorization: Bearer <accessToken>` and the `products.manage` permission.

`GET /products`

Supports pagination and filtering with `page`, `pageSize`, `search`, `status`, `categoryId`, and `supplierId`.

`POST /products`

Creates a product with SKU, prices, units, optional supplier/category links, and optional barcodes. The API validates input, writes an audit log, and publishes a local `product:created` update event.

Product payloads may include `variant` and `salesChannel`. `salesChannel` is `RETAIL`, `RESTAURANT`, or `BOTH` and defaults to `RETAIL`.

`GET /products/:id`

Returns product details, barcodes, category, supplier, warehouse stock balances, and recent price history.

`PATCH /products/:id`

Updates product details. Price changes are stored in `PriceHistory` and published as `price:changed`; other updates publish `product:updated`.

`DELETE /products/:id`

Soft-deletes the product by setting `deletedAt` and marking it inactive. Products are never physically deleted.

## Inventory

All inventory endpoints require `Authorization: Bearer <accessToken>` and the `inventory.manage` permission.

`GET /inventory/warehouses`

Returns active warehouses for stock receiving, movement, and adjustment screens.

`GET /inventory/stock`

Returns paginated stock balances by product and warehouse. Supports `page`, `pageSize`, `productId`, `warehouseId`, `search`, and `lowStockOnly`.

`GET /inventory/movements`

Returns permanent movement history. Supports `page`, `pageSize`, `productId`, `warehouseId`, and `type`.

`POST /inventory/movements`

Creates a transactional stock movement. Supported movement types are `STOCK_IN`, `STOCK_OUT`, `ADJUSTMENT`, `DAMAGE`, `RETURN`, and `PURCHASE_RECEIPT`. Stock-out style movements cannot make inventory negative.

`POST /inventory/counts`

Sets stock to a counted quantity and stores the signed adjustment delta permanently.

`POST /inventory/transfers`

Transfers stock between warehouses in one database transaction. The API writes paired transfer movement rows and publishes local inventory update events.

## Inventory Imports

Import endpoints require the inventory.import permission; rollback additionally requires inventory.import.rollback.

### POST /inventory-imports/preview

Validates up to 10,000 mapped spreadsheet rows without changing products or stock. Matching priority is Product ID, SKU, barcode, product name plus variant, then product name. Name-only matches require an explicit duplicate action or manual Product ID. The response contains row status, action, warnings, errors, stock difference, summary totals, duplicate-batch information, and a confirmation fingerprint.

### POST /inventory-imports/execute

Revalidates the complete request and requires the exact fingerprint returned by preview. Valid rows are processed in configured transaction batches. Product changes, stock balances, inventory movements, row results, and audit records are persisted together. A previously completed identical import is rejected when duplicate-file protection is enabled.

### GET /inventory-imports

Returns paginated import history for the current store.

### GET /inventory-imports/:id

Returns a batch with row-level results and before/after stock quantities.

### GET /inventory-imports/:id/report

Downloads a CSV report containing every row, result, stock difference, warning, and error.

### POST /inventory-imports/:id/rollback

Safely reverses a completed batch. Rollback is rejected when a product changed, a later stock movement exists, or a newly imported product is used by a sale, held sale, refund, or purchase order.

### GET /inventory-imports/presets

Lists active column-mapping presets.

### POST /inventory-imports/presets

Creates a named mapping preset.

### DELETE /inventory-imports/presets/:id

Soft-deletes a mapping preset.

## Users

All user endpoints require `Authorization: Bearer <accessToken>` and the `users.manage` permission.

`GET /users`

Returns active and inactive non-deleted users with role and status details.

`POST /users`

Creates an administrator or cashier account.

Request:

```json
{
  "name": "Cashier One",
  "email": "cashier@example.com",
  "password": "strong-password",
  "role": "CASHIER"
}
```

`PATCH /users/:id`

Updates a user's name, role, status, or password. User changes are audited.

## Sales

All sales endpoints require `Authorization: Bearer <accessToken>` and the `sales.manage` permission.

`GET /sales`

Returns paginated completed sales with cashier, items, and payments.

`POST /sales`

Completes a sale in one transaction. The API creates a receipt number, sale items, sale payments, stock deductions, inventory movement rows, and an audit log.

Optional restaurant-compatible fields are `orderNumber`, `orderType`, `serviceCharge`, and `tip`. Existing retail requests may omit them; defaults preserve the original checkout behavior.

Request:

```json
{
  "customerId": null,
  "items": [
    {
      "productId": "product-id",
      "warehouseId": "warehouse-id",
      "quantity": 2500,
      "soldUnit": "GRAM",
      "discount": 0
    }
  ],
  "payments": [
    {
      "method": "CASH",
      "amount": 100,
      "reference": null
    }
  ]
}
```

For variable quantity selling, `quantity` is the amount entered by the cashier in `soldUnit`. The backend converts it to the product inventory unit, saves both the entered quantity and base stock quantity, calculates the package-based price, and deducts the converted stock amount. For example, a 5kg product priced at ₱300 can be sold as `2500` `GRAM`; the sale line totals ₱150 and deducts 2.5kg.

## Restaurant Operations

Restaurant endpoints require authentication, Restaurant or Hybrid business mode, and the stated permission. The runtime mode and restaurant feature flags are available to any signed-in user from `GET /settings/runtime`.

### Tables

- `GET /restaurant/tables` requires `orders.manage` and returns active tables with status, assigned employee, and active order.
- `POST /restaurant/tables` requires `tables.manage` and creates a table.
- `PATCH /restaurant/tables/:id` requires `tables.manage` and updates table details or status.
- `DELETE /restaurant/tables/:id` requires `tables.manage` and soft-disables an unused table.

Table statuses are `AVAILABLE`, `OCCUPIED`, `RESERVED`, `AWAITING_ORDER`, `PREPARING`, `SERVED`, `AWAITING_PAYMENT`, and `CLEANING`. Assigning several tables to one active order joins them without duplicating the order.

### Active Orders

- `GET /restaurant/orders` lists active orders; `includeClosed=true` includes completed and cancelled history.
- `POST /restaurant/orders` creates a dine-in, walk-in, counter, takeout, pickup, or delivery order.
- `PATCH /restaurant/orders/:id` updates customer details, notes, items, quantities, discounts, and status using `expectedVersion`.
- `POST /restaurant/orders/:id/lock` acquires or renews a two-minute employee edit lease.
- `DELETE /restaurant/orders/:id/lock` releases the caller's edit lease and holds the order for later.
- `PUT /restaurant/orders/:id/tables` moves or joins tables.
- `POST /restaurant/orders/:id/cancel` requires `orders.cancel`; cancellation is audited and retained.
- `POST /restaurant/orders/:id/reopen` requires `orders.reopen` and reopens an unpaid cancelled order.
- `POST /restaurant/orders/:id/checkout` requires `sales.manage` and completes payment.

Checkout re-reads and version-checks the held order inside the existing sale transaction. The same transaction creates `Sale`, `SaleItem`, `SalePayment`, stock deductions, `InventoryMovement`, and audit records, marks the held order complete, and moves assigned tables to cleaning. A unique held-sale link rejects repeated checkout instead of deducting stock twice.

## Receipts

All receipt endpoints require `Authorization: Bearer <accessToken>` and the `sales.manage` permission.

`GET /receipts/sales/:saleId?paperWidth=80mm`

Returns a print-ready receipt for a completed sale. Supported paper widths are `58mm` and `80mm`.

Response includes:

```json
{
  "saleId": "sale-id",
  "receiptNumber": "POS-000001",
  "paperWidth": "80mm",
  "barcodeData": "POS-000001",
  "barcodeSvg": "<svg>...</svg>",
  "text": "plain thermal receipt text",
  "html": "print-ready receipt html",
  "escPosBase64": "base64-encoded ESC/POS command payload"
}
```

## Reports

All report endpoints require `Authorization: Bearer <accessToken>` and the `sales.manage` permission.

`GET /reports/overview?period=daily`

Returns sales count, revenue, gross profit, average sale, inventory value, low-stock count, best sellers, cashier sales, payment summaries, and inventory report rows. Supported periods are `daily`, `weekly`, `monthly`, and `custom` with optional `startDate` and `endDate`.

`GET /reports/export?period=daily&format=excel`

Returns an export payload. `format=excel` returns Excel-compatible CSV content. `format=pdf` returns print-ready report HTML that can be saved as PDF from the Windows print dialog.

## Settings and Backups

All settings endpoints require `Authorization: Bearer <accessToken>` and the `settings.manage` permission.

`GET /settings`

Returns business mode, business, tax, receipt, printer, theme, backup, inventory import, and restaurant settings with defaults applied.

`PUT /settings`

Updates settings groups and records an audit log.

Business mode is `RETAIL`, `RESTAURANT`, or `HYBRID`. Inventory import settings include batch size, duplicate-file protection, and the default import mode. Restaurant settings include enabled order types, tables, kitchen tickets, service charge, split billing, partial payments, and order-number format.

`GET /settings/backups`

Lists recent local backup runs.

`POST /settings/backups`

Creates a manual copy of the local SQLite database in the managed backup folder and records a `BackupRun`.

`POST /settings/restore`

Restores a completed managed backup by ID, preserves a pre-restore safety copy, and returns `requiresRestart: true`.

`POST /receipts/sales/:saleId/print`

Records a permanent receipt print request and returns the same print payload. `printerType` can be `WINDOWS` for the app print dialog or `ESC_POS` for thermal printer command output.

Request:

```json
{
  "paperWidth": "80mm",
  "printerType": "WINDOWS",
  "printerName": "Windows default printer"
}
```
