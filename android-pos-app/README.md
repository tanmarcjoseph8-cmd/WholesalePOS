# WholesalePOS Offline Android

This folder is an independent Android tablet edition of WholesalePOS. It does not import, modify, or package the Windows Electron backend.

## Platform baseline

- Package ID: `com.wholesalepos.offline`
- Capacitor: 8.4.2
- Minimum Android: Android 9 / API 28, including Fire OS 7
- Target and compile SDK: API 36
- Local database: SQLite through `@capacitor-community/sqlite`
- Normal operation: completely offline with no network server

See `docs/AUDIT.md` for the Windows compatibility audit and `docs/ARCHITECTURE.md` for Android boundaries.

## Installable builds

- `apk/WholesalePOS-Offline-0.4.1-release.apk`: signed APK for direct tablet installation
- `apk/WholesalePOS-Offline-0.4.1-debug.apk`: development APK
- `apk/WholesalePOS-Offline-0.4.1-release.aab`: signed Android App Bundle
- `apk/checksums.json`: SHA-256 checksums for all artifacts

Start with [Build and installation](docs/BUILD_AND_INSTALL.md), then read [Backup and restore](docs/BACKUP_RESTORE.md) before entering live business data.

## Development

```powershell
pnpm install
pnpm verify
pnpm cap:sync
```

Native APK builds require JDK 21 and Android SDK 36. Detailed setup and signing instructions are maintained in `docs/BUILD_AND_INSTALL.md`.

## Documentation

- [User guide](docs/USER_GUIDE.md)
- [Sales reports and inventory alerts](docs/SALES_REPORTS_AND_ALERTS.md)
- [Cash drawer operations](docs/CASH_DRAWER.md)
- [Product import format](docs/IMPORT_TEMPLATE.md)
- [Fire OS 7 installation](docs/FIRE_OS_7.md)
- [Printer setup](docs/PRINTER_SETUP.md)
- [Migration notes](docs/MIGRATION_NOTES.md)
- [Known limitations](docs/KNOWN_LIMITATIONS.md)
- [Verification report](docs/TEST_REPORT.md)
- [UI redesign audit](docs/UI_REDESIGN_AUDIT.md)
- [Design system](docs/DESIGN_SYSTEM.md)
- [UI redesign verification](docs/UI_REDESIGN_VERIFICATION.md)
- [File summary](docs/FILE_SUMMARY.md)
