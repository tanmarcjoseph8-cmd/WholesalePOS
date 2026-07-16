# Cash Drawer Operations

## Daily workflow

1. Sign in as the cashier who will control the tablet.
2. Open **Cash Drawer**, enter the counted starting float, and open the drawer.
3. Complete sales normally. Cash retained after change is posted automatically;
   non-cash payments do not affect the drawer.
4. Use **Add cash** or **Remove cash** for physical drawer movements unrelated to
   a sale. Every movement requires a reason and is written to the audit log.
5. At shift end, close the drawer using the PHP denomination counter or a manual
   actual-cash total.
6. Review the expected, actual, and difference values before confirming.

Expected cash is calculated as:

`opening cash + cash sales - cash refunds + cash in - cash out + corrections`

Opening cash and cash in are physical cash control values, not sales revenue.
Sales reports therefore show cash drawer reconciliation separately from revenue.

## Roles and controls

- Cashier: open, view, move, and close only their own session.
- Manager: use and manage the active drawer, view all sessions, correct a manual
  movement with a compensating ledger entry, and review differences.
- Owner: all manager capabilities through the owner wildcard permission.

Cashier mode does not expose Inventory, Alerts, Settings, Reports, product edit,
product deactivate, import, or stock adjustment controls. Backend services still
reject unauthorized inventory and catalog writes if UI navigation is bypassed.

## Reliability

Cash sessions and movements are stored in the same offline SQLite database as
sales. Cash sale/refund entries commit in the same transaction as payments,
inventory movements, and audit records. Unique request keys prevent duplicate
opening, closing, sale, refund, and manual movement entries after repeated taps.
Closing stores the expected and actual snapshot plus denomination counts. History
is never physically deleted and is included in full database backups.

Install updates with the same Android package ID and signing key. Migration 4
adds the cash tables without resetting existing data. Always make a full backup
before updating a live tablet.
