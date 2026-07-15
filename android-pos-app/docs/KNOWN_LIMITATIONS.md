# Known Limitations

- Data is intentionally local to one tablet; there is no cloud sync, multi-device
  realtime sync, web server, or Windows connection.
- Direct raw Bluetooth ESC/POS transport is not included. Receipts use Android
  PDF save/share/print services.
- Card and GCash payments are recorded but not processed through a payment
  gateway. Never enter full card details in references or notes.
- CSV/XLSX import supports documented header aliases, preview, validation, and
  duplicate handling; it does not provide an arbitrary drag-and-drop column mapper.
- Android backups are integrity protected JSON but are not encrypted files.
- The release is signed with a private self-managed key, not a public app-store
  identity. Preserve that key for updates.
- The automated device run used an Android 10 emulator. Physical tablet,
  Bluetooth printer, camera barcode, manufacturer power-management, and
  multi-hour load testing remain hardware acceptance tests.
- The headless Android 10 emulator used for verification showed GPU/font capture
  artifacts; the accessibility tree and app flows remained functional. Check
  visuals on the target physical tablet before deployment.
