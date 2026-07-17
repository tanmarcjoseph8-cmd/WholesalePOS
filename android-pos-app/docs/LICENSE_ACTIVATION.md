# Offline License Activation

WholesalePOS Offline 0.6.0 requires a signed license before owner setup, login,
POS, inventory, restaurant, reports, or settings can open. Activation does not
need internet access.

## Activate A Tablet

1. Install and open the signed 0.6.0 release APK.
2. Copy the Device ID shown on the activation screen.
3. On the owner's Windows PC, generate a matching license in the private
   WholesalePOS License Manager.
4. Enter the activation code manually or select **Scan QR code** and scan the
   generated QR. Camera permission is requested only for scanning.
5. After verification, create or sign in to the local Owner account.

The app verifies the P-256 signature, product identifier, canonical payload,
issue timestamp, and exact Device ID. It contains only the public verification
key. The private signing key exists only inside the owner's encrypted License
Manager vault.

## About And License

Owners can open **Settings > About & License** to view the app version, Device
ID, activation status, activation date, product, and edition. The activation
code is intentionally hidden after successful activation.

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
There is no network channel for remote revocation on an already activated
tablet. Physical access or a future online licensing service is required for
remote enforcement.
