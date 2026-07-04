# Phase 10 - Backup and Settings

Phase 10 adds business settings, tax settings, receipt settings, printer settings, theme settings, manual backup, backup history, and managed restore.

## Completed

- Added secured settings API.
- Added business, tax, receipt, printer, theme, and backup setting groups.
- Added a Settings page for editing configuration.
- Added manual local SQLite backup creation.
- Added backup history listing.
- Added managed restore from completed backup records with a pre-restore safety copy and restart-required response.
- Added audit logs for settings updates and backup restores.
- Extended packaged desktop smoke testing to update settings and create a backup.

## Files Changed

- `backend/src/app.ts`
- `backend/src/modules/settings/setting.routes.ts`
- `backend/src/modules/settings/setting.schemas.ts`
- `backend/src/modules/settings/setting.service.ts`
- `frontend/src/lib/api.ts`
- `frontend/src/ui/App.tsx`
- `frontend/src/views/SettingsPage.tsx`
- `scripts/smoke-packaged-desktop.mjs`
- `docs/API.md`
- `docs/DATABASE.md`
- `docs/PHASE_10_BACKUP_SETTINGS.md`

## Verification

Run the normal verification workflow:

```powershell
pnpm verify
pnpm desktop:package:win
pnpm desktop:smoke:win
```
