# Developer Guide

## Architecture

The repository separates UI, server behavior, data ownership, and operational documentation:

- `frontend/` contains React UI, client state, routing, and browser integrations.
- `backend/` contains Express API modules, validation, services, Prisma access, authentication, and realtime events.
- `database/` contains database operational notes.
- `docker/` contains container definitions.
- `tests/` contains cross-application test assets.

## Development Rules

- Validate inbound requests with Zod.
- Keep database writes in backend services.
- Use transactions for inventory, sales, receiving, and price changes.
- Publish Socket.IO events after committed business changes.
- Preserve backwards compatibility for existing API consumers.

## Product Module

The product catalog owns SKU, barcode, unit, price, supplier, and category metadata. Product writes live in backend services, run through Zod validation, create audit rows, and publish realtime events after successful transactions.
