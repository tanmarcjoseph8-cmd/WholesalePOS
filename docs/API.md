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
