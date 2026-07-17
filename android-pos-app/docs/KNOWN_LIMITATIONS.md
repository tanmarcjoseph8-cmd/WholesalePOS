# Known Limitations

- Data is intentionally local to one tablet; there is no cloud sync, multi-device
  realtime sync, web server, or Windows connection.
- License generation and customer records are intentionally offline in the
  owner's Windows License Manager. Revoking, archiving, or replacing a record
  cannot remotely disable a tablet that is already activated and offline.
  Monthly and yearly signed expiration is still enforced by the tablet.
- Direct raw Bluetooth ESC/POS transport is not included. Receipts use Android
  PDF save/share/print services.
- Card and GCash payments are recorded but not processed through a payment
  gateway. Never enter full card details in references or notes.
- CSV/XLSX import supports documented header aliases, preview, validation, and
  duplicate handling; it does not provide an arbitrary drag-and-drop column mapper.
- Android backups are integrity protected JSON but are not encrypted files.
- Activation is device-bound. A backup restored on a different tablet cannot
  transfer the license; clearing storage or uninstalling requires reissue.
- Deliberately clearing all Android app storage also clears the Keystore-backed
  verification state and activation record. It does not provide a way to retain
  or bypass a renewable license because the app returns to activation.
- The release is signed with a private self-managed key, not a public app-store
  identity. Preserve that key for updates.
- The automated device run used an Android 10 emulator. The build and dependency
  manifests validate API 28, but a physical Fire OS 7 tablet remains required for
  final Fire-specific acceptance. Physical tablet,
  Bluetooth printer, camera barcode, manufacturer power-management, and
  multi-hour load testing remain hardware acceptance tests.
- The headless Android 10 emulator used for verification showed GPU/font capture
  artifacts; the accessibility tree and app flows remained functional. Check
  visuals on the target physical tablet before deployment.
- Android system notifications are delivered while the app process is running
  and after local stock changes. The app has no server or background sync that
  can receive stock changes while it is closed. Persisted in-app alerts are
  reconciled whenever the app starts or inventory changes.
- At most 100 pending product alerts are submitted to the Android notification
  tray in one activation to protect older Fire tablets. Every alert remains in
  the in-app Alerts screen, and later activations continue pending delivery.
- PDF preview requires a PDF-capable application installed on the tablet. The
  Android share sheet remains available for saving, sharing, or printing.
- Refunds and voids are grouped into the report period of their original sale.
  The app does not yet provide a separate cash-movement report grouped by the
  date a reversal was processed.
