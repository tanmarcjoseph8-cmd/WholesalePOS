# WholesalePOS License Manager

This is the private, offline Windows license authority for WholesalePOS products.
It is for the software owner only. Do not distribute it to customers.

## First Run

1. Extract `release/WholesalePOS License Manager-1.0.0-win.zip` on the owner's
   Windows PC and open `WholesalePOS License Manager.exe`.
2. Choose an administrator password containing at least 12 characters. This
   password is not stored or recoverable.
3. Open Settings and create a manual encrypted backup immediately. Keep two
   copies outside the PC together with the password.
4. Configure the company name, logo, contact details, automatic backup, and
   automatic lock interval.

The one-time signing authority bootstrap is protected with Windows DPAPI for the
current Windows account. On first setup it is moved into the password-encrypted
vault and the bootstrap is deleted. The private P-256 signing key never enters
the renderer, Android package, spreadsheets, print output, or logs.

## Issue a License

1. Open WholesalePOS Offline on the customer's tablet and copy its Device ID.
2. Select **Generate license**, enter the customer and exact Device ID, then
   choose the licensed product and application version.
3. Scan the generated QR code on the tablet or enter the activation code
   manually. Both methods perform the same signature and Device ID checks.
4. Print or save the activation sheet for the customer when required.

An existing Device ID is never silently duplicated. Use **Reissue** to retrieve
the exact existing activation code for the same tablet. Use **Replace device**
for a new tablet; the previous license is retained as Replaced and a permanent
history event records the change.

## Data And Recovery

- The customer database, activation history, products, branding, preferences,
  and private authority key are stored in one AES-256-GCM encrypted vault.
- The administrator password is processed with scrypt before vault encryption.
- Automatic backups are encrypted and retained locally; manual backups can be
  moved to offline media and restored after a Windows reinstall.
- CSV import/export and Excel export contain customer and signed license data,
  but never the signing key. Imported activation codes must have a valid
  authority signature.
- Revoked, Archived, and Replaced records remain in permanent history.

Because customer tablets are intentionally offline, changing a status in the
License Manager cannot remotely disable an already activated tablet. Status is
the owner's authoritative record. Remote revocation requires a future online
service or physical access to the tablet.

## Development

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd --filter @wholesalepos/license-manager verify
pnpm.cmd --filter @wholesalepos/license-manager package:win
```

The portable Windows package is produced under `license-manager/release/`.
Never commit the encrypted vault, backups, DPAPI bootstrap, administrator
password, signing keystore, or any private-key material.
