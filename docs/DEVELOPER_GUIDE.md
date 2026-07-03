# Developer Guide

## Architecture

The repository separates UI, server behavior, data ownership, and operational documentation:

- `frontend/` contains React UI, client state, routing, and browser integrations.
- `backend/` contains Express API modules, validation, services, Prisma access, authentication, and local update events.
- `database/` contains database operational notes.
- `docker/` contains container definitions.
- `tests/` contains cross-application test assets.

## Development Rules

- Validate inbound requests with Zod.
- Keep database writes in backend services.
- Use transactions for inventory, sales, receiving, and price changes.
- Publish local update events after committed business changes so the active device can refresh without a page reload.
- Preserve backwards compatibility for existing API consumers.

## Product Module

The product catalog owns SKU, barcode, unit, price, supplier, and category metadata. Product writes live in backend services, run through Zod validation, create audit rows, and publish local update events after successful transactions.
