import { Capacitor, registerPlugin } from "@capacitor/core";

export type SecureLicenseState = {
  lastVerifiedTime: number | null;
  lastSuccessfulLaunch: number | null;
  warningLicenseId: string | null;
  dismissedWarnings: number[];
};

type NativeLicenseSecureStore = {
  getState(): Promise<SecureLicenseState>;
  recordVerification(input: { licenseId: string; successfulLaunch: boolean }): Promise<SecureLicenseState>;
  dismissWarning(input: { licenseId: string; thresholdDays: number }): Promise<SecureLicenseState>;
};

const nativeStore = registerPlugin<NativeLicenseSecureStore>("LicenseSecureStore");
const WEB_KEY = "wpos_license_secure_clock_development";
const emptyState = (): SecureLicenseState => ({ lastVerifiedTime: null, lastSuccessfulLaunch: null, warningLicenseId: null, dismissedWarnings: [] });

function readWebState() {
  try { return JSON.parse(localStorage.getItem(WEB_KEY) ?? "null") as SecureLicenseState | null ?? emptyState(); }
  catch { return emptyState(); }
}

function writeWebState(state: SecureLicenseState) {
  localStorage.setItem(WEB_KEY, JSON.stringify(state));
  return state;
}

/** Provides Keystore-encrypted license timestamps on Android and a development-only browser fallback. */
export class LicenseSecureStore {
  /** Reads rollback and warning state without changing the secure clock. */
  async getState() {
    return Capacitor.isNativePlatform() ? nativeStore.getState() : readWebState();
  }

  /** Advances secure timestamps after successful signed-license verification. */
  async recordVerification(licenseId: string, successfulLaunch: boolean) {
    if (Capacitor.isNativePlatform()) return nativeStore.recordVerification({ licenseId, successfulLaunch });
    const state = readWebState();
    const current = Date.now();
    const changedLicense = state.warningLicenseId !== licenseId;
    return writeWebState({ lastVerifiedTime: Math.max(state.lastVerifiedTime ?? 0, current), lastSuccessfulLaunch: successfulLaunch ? Math.max(state.lastSuccessfulLaunch ?? 0, current) : state.lastSuccessfulLaunch, warningLicenseId: licenseId, dismissedWarnings: changedLicense ? [] : state.dismissedWarnings });
  }

  /** Permanently dismisses one warning threshold for only the current signed license. */
  async dismissWarning(licenseId: string, thresholdDays: number) {
    if (Capacitor.isNativePlatform()) return nativeStore.dismissWarning({ licenseId, thresholdDays });
    const state = readWebState();
    const dismissedWarnings = state.warningLicenseId === licenseId ? [...new Set([...state.dismissedWarnings, thresholdDays])] : [thresholdDays];
    return writeWebState({ ...state, warningLicenseId: licenseId, dismissedWarnings });
  }
}

export const licenseSecureStore = new LicenseSecureStore();
