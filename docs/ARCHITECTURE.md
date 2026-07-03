# Architecture

## Deployment Model

WholesalePOS is now scoped as a single-device POS and inventory system. The application should run on one primary computer or tablet for one business location at a time.

The system does not need to coordinate live state across multiple cashiers, tablets, phones, or remote terminals. This keeps the product simpler to operate and reduces networking requirements for small shops.

During development, data persists locally in `database/wholesalepos.sqlite`. In the desktop app, data persists under the user's application data folder. That SQLite file is the durable day-to-day memory for products, stock, sales, users, and audit history.

## Desktop Runtime

The Electron shell starts the built backend on `127.0.0.1`, runs Prisma migrations against the local SQLite database, serves the built frontend through the backend, and opens the app window against that local URL.

## Local Updates

The app must still update immediately on the active device after important actions:

- product creation and edits
- price changes
- inventory receiving
- stock adjustments
- transfers
- sales and returns

Backend services may continue publishing internal realtime events after successful transactions. In the single-device model, these events are used for local UI refresh, logs, and future extensibility rather than cross-device synchronization.

## Out Of Scope

The following are no longer required for the current product direction:

- simultaneous multi-cashier synchronization
- automatic updates across multiple devices
- offline transaction queues for remote clients
- conflict resolution between devices
- multi-terminal session coordination

## Still Required

The single-device scope does not reduce data integrity requirements:

- every sale must be recoverable
- every inventory movement must be permanent
- price changes must be audited
- login activity must be audited
- inventory updates must use transactions
- the UI must refresh after local changes without a manual page reload
