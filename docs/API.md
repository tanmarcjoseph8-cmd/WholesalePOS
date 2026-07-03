# API Documentation

Base URL: `/api`

## Health

`GET /health`

Returns service status and timestamp.

## Authentication

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

All product endpoints require `Authorization: Bearer <accessToken>`.

`GET /products`

Supports pagination and filtering with `page`, `pageSize`, `search`, `status`, `categoryId`, and `supplierId`.

`POST /products`

Creates a product with SKU, prices, units, optional supplier/category links, and optional barcodes. The API validates input, writes an audit log, and broadcasts `product:created`.

`GET /products/:id`

Returns product details, barcodes, category, supplier, warehouse stock balances, and recent price history.

`PATCH /products/:id`

Updates product details. Price changes are stored in `PriceHistory` and broadcast as `price:changed`; other updates broadcast `product:updated`.

`DELETE /products/:id`

Soft-deletes the product by setting `deletedAt` and marking it inactive. Products are never physically deleted.
