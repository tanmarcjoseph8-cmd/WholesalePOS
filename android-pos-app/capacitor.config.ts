import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.wholesalepos.offline",
  appName: "WholesalePOS Offline",
  webDir: "dist",
  server: {
    androidScheme: "https"
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#f1f5f9"
  },
  plugins: {
    CapacitorSQLite: {
      androidIsEncryption: false,
      androidBiometric: {
        biometricAuth: false,
        biometricTitle: "Unlock WholesalePOS"
      }
    },
    LocalNotifications: {
      smallIcon: "ic_launcher_foreground",
      iconColor: "#176b54"
    }
  }
};

export default config;
