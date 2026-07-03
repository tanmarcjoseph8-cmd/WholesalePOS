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
