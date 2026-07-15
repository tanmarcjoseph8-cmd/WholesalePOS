# Build and Installation

## Install on an Android tablet

The release build supports Android 9 (API 28), Fire OS 7, and later versions.

1. Copy `apk/WholesalePOS-Offline-0.1.1-release.apk` to the tablet.
2. Open the APK from Files.
3. If Android blocks it, allow **Install unknown apps** for the Files application, then retry.
4. Open **WholesalePOS Offline** and create the first owner account.
5. Create a full backup before relying on the tablet for live transactions.

For an update, install the newer APK over the existing app. Keep the package ID
`com.wholesalepos.offline` and sign with the same release key. **Do not uninstall
the app or clear its storage**, because either action deletes the local database.

With Android platform tools installed:

```powershell
adb install -r .\apk\WholesalePOS-Offline-0.1.1-release.apk
```

Compare the APK with `apk/checksums.json`:

```powershell
Get-FileHash .\apk\WholesalePOS-Offline-0.1.1-release.apk -Algorithm SHA256
```

## Development prerequisites

- Node.js 22 or later
- pnpm 11
- JDK 21
- Android SDK Platform 36 and Build Tools
- Android Studio when using the graphical native tools

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd verify
pnpm.cmd cap:sync
```

Set `sdk.dir` in `android/local.properties`, set `JAVA_HOME` to JDK 21, then:

```powershell
Set-Location android
.\gradlew.bat :app:testDebugUnitTest :app:connectedDebugAndroidTest :app:assembleDebug
```

## Signed release

Generate signing material once:

```powershell
$env:JAVA_HOME = "C:\path\to\jdk-21"
node .\scripts\create-release-keystore.mjs
```

Load the four variables from `.toolchain/signing/release-signing.env`, then run:

```powershell
Set-Location android
.\gradlew.bat assembleRelease bundleRelease
Set-Location ..
node .\scripts\collect-apk.mjs
```

Back up both `wholesalepos-release.jks` and its secret environment file in a
secure offline location. Losing either prevents trusted in-place updates. Never
commit signing material.

Before each release, increment `versionCode` and update `versionName` in
`android/app/build.gradle`, rebuild, verify the signature, and test
`adb install -r` against a backed-up copy of real data.
