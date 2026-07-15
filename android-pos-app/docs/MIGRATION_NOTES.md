# Migration Notes

The Android edition is an independent product with package ID
`com.wholesalepos.offline`. It does not connect to, package, migrate, or modify
the Windows Electron application.

There is no automatic transfer of Windows users, sales, tables, settings, or
SQLite files. Products and starting stock can be moved deliberately by exporting
or preparing a CSV/XLSX file in the documented Android import format. Reconcile
totals and quantities before using the tablet for live sales.

Android updates use ordered SQLite migrations recorded in `schema_migrations`.
Startup never drops or recreates the operational database. Keep the package ID
and release signing key unchanged, increment the Android version, make a full
backup, and install updates in place.
