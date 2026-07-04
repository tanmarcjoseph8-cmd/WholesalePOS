# Deployment Guide

WholesalePOS is currently structured for single-device local deployment. The normal setup does not require Docker, PostgreSQL, or a server running elsewhere.

## Deployment Checklist

- Use the Electron desktop package for downloadable Windows builds.
- The desktop shell creates persistent JWT secrets under the user's application data folder.
- The desktop shell runs Prisma migrations before first use so the local SQLite database is ready.
- Keep the installed app folder on a reliable local drive.
- Back up the SQLite database under the user's application data folder on a fixed retention schedule.
- Restrict CORS to the local frontend origin for the desktop build.
- Enable log collection for backend stdout.

## Windows Package

Create the verified zip package:

```powershell
pnpm desktop:package:win
```

Smoke-test the package before giving it to a user:

```powershell
pnpm desktop:smoke:win
```

Give the user this file:

```text
desktop\release\WholesalePOS-0.1.0-win.zip
```

The user extracts the zip and runs `WholesalePOS.exe`. The app creates its database, secret keys, logs, and backup folder under the user's application data folder.

## Desktop Troubleshooting

If the Windows desktop app shows a startup error, check the startup log at `%APPDATA%\WholesalePOS\logs\desktop.log`. The log records database migration output and local backend startup output.

## Updates

The desktop shell includes `electron-updater` wiring. Published update channels still need a release feed configured before automatic production updates can be delivered.

The verified package target currently creates a Windows zip. The NSIS installer command is available, but final installer verification requires the local NSIS toolchain to run successfully in the build environment.
