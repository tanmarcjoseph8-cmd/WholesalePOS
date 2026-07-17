# Backup and Restore

## Create a backup

Sign in as an owner or authorized manager, open **Settings**, and choose **Full
backup**. Android's share sheet lets you save the timestamped JSON file to a
trusted folder, USB storage, or another device.

A full backup contains products, stock, movements, sales, payments, users,
password hashes, restaurant data, settings, and audit history. It is integrity
protected but not encrypted as a file, so store it securely.

Use at least two off-tablet copies and test restore periodically on a spare
installation. Back up before app updates, bulk imports, and major stock work.

## Factory reset backup

Owner Factory Reset creates a full backup by default before deletion. It writes
and verifies `before-factory-reset-<timestamp>.json` in the app-specific external
**WholesalePOS Backups** folder. The backup contains the reset-request audit
entry, reset metadata, full SQLite export, and SHA-256 payload hash. A write,
verification, or zero-byte failure stops the reset before business data is
deleted.

The folder survives the in-app Factory Reset, but Android may remove it when the
app is uninstalled, app storage is cleared, or the tablet is reset. Move the file
off the tablet for durable recovery. See [Owner Factory Reset](FACTORY_RESET.md).

## Restore

1. Open **Settings** and choose **Restore backup**.
2. Read the replacement warning and type `RESTORE` exactly.
3. Select a WholesalePOS Android backup JSON file.
4. Save the offered pre-restore safety backup somewhere safe.
5. Let validation and replacement finish without closing the app.

The app checks the format marker, schema version, SHA-256 payload hash, and
SQLite import validity before replacement. A backup from a newer schema is
rejected. Restore replaces all current local operational data.

Windows-edition databases and Android JSON backups are not interchangeable.

## Update safety

An in-place APK update preserves app data and runs migrations. Uninstalling,
clearing app storage, factory-resetting the tablet, or losing the device removes
the local database. A backup is the recovery mechanism.
