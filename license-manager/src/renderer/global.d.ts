import type { LicenseManagerApi } from "../shared/contracts";

declare global {
  interface Window {
    licenseManager: LicenseManagerApi & { onAutoLocked(listener: () => void): () => void };
  }
}

export {};
