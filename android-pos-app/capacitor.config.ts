import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.wholesalepos.offline",
  appName: "Suki Sync",
  webDir: "dist",
  server: {
    androidScheme: "https"
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#f3f5f7"
  },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: false,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: "Unlock Suki Sync"
      }
    },
    LocalNotifications: {
      smallIcon: "ic_launcher_foreground",
      iconColor: "#0f766e"
    }
  }
};

export default config;
