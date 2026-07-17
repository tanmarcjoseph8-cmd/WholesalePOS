# Offline License Activation

Suki Sync 0.7.0 requires a signed license before owner setup, login, POS,
inventory, restaurant, reports, or settings can open. Activation, validation,
expiration, and renewal do not need internet access.

## Activate A Tablet

1. Install and open the signed 0.7.0 release APK.
2. Copy the Device ID shown on the activation screen.
3. On the owner's Windows PC, generate a matching license in the private
   WholesalePOS License Manager.
4. Enter the activation code manually or select **Scan QR code** and scan the
   generated QR. Camera permission is requested only for scanning.
5. After verification, create or sign in to the local Owner account.

The app verifies the P-256 signature, supported payload version, product
identifier, canonical payload, issue and expiration timestamps, license type,
and exact Device ID. It contains only the public verification key. The private
signing key exists only inside the owner's encrypted License Manager vault.

## License Terms And Renewal

The License Manager can issue **Monthly**, **Yearly**, and **Lifetime** plans.
Monthly and yearly expiration timestamps are signed into the activation code;
lifetime licenses have no expiration. Version 1 activation codes issued before
0.7.0 remain valid and are treated as lifetime licenses.

The app validates its license at launch, when returning from the background,
and immediately before checkout. Owners receive dismissible expiration warnings
at 30, 14, 7, 3, and 1 day remaining. When a renewable license expires, Suki
Sync blocks business operations but preserves all products, stock, sales,
settings, users, and audit history.

To renew, open the same license in the Windows License Manager, select **Renew
License**, verify the tablet's existing Device ID, and choose the new term. Enter
or scan the newly signed activation code on the tablet. Renewal does not require
an uninstall, a new Device ID, or a database reset.

## About And License

Owners can open **Settings > About & License** to view the app version, Device
ID, license type, activation date, expiration date, days remaining, product,
edition, and current status. The activation code and signature are intentionally
hidden after successful activation.

## Reset, Reinstall, And Restore

- In-app Owner Factory Reset preserves the signed activation while erasing all
  business records. First-owner setup opens again without another activation.
- Installing a correctly signed update over the existing package preserves the
  activation and business database.
- Uninstalling, clearing Android storage, or factory-resetting the tablet removes
  local activation. The owner can use **Reissue** for the same Device ID.
- A full backup restored on a different tablet does not transfer the license.
  Device binding is checked again at startup.

License status changes are managed in the owner's offline Windows database.
Because there is no network channel, manually revoking a currently active
license in the manager cannot immediately reach an offline tablet. Signed
expiration is enforced locally; physical access is required for early
revocation.

The last successful verification and launch times are stored with
Android-Keystore-backed encryption. Moving the device clock backwards beyond
the allowed tolerance blocks protected operations until the clock is corrected.
