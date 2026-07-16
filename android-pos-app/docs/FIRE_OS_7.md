# Fire OS 7 Installation

Version 0.3.2 supports Fire OS 7, which uses Android API 28.

## Install

1. On the Fire tablet, open **Settings > Security & Privacy**.
2. Open **Apps from Unknown Sources** or **Install Unknown Apps**.
3. Allow the browser or Files application that will open the APK.
4. Transfer `WholesalePOS-Offline-0.3.2-release.apk` to the tablet.
5. Open the APK and choose **Install**.
6. Open WholesalePOS Offline and complete owner setup.
7. Create a full backup and move a copy off the tablet.

The setting names can vary by Fire tablet generation. Amazon also supports
sideloading with `adb install`.

## Updating an existing installation

Install version 0.3.2 over the existing WholesalePOS Offline installation. Do not
uninstall it and do not clear app storage. The package ID and signing certificate
are unchanged, so an in-place update preserves the local SQLite database.

Fire OS 7 does not show the Android 13 notification permission prompt. Inventory
notifications are controlled under **Settings > Notifications & Permissions >
Application Notifications > WholesalePOS Offline** when that menu is available.

## Fire tablet acceptance check

Before live use, verify product creation, stock entry, one cash sale, one table
order, CSV/XLSX selection, backup export and restore, receipt PDF sharing, screen
rotation, and reopening the app after restarting the tablet.

Amazon testing reference:
https://developer.amazon.com/docs/fire-tablets/ft-test-app-on-emulator-or-tablet.html
