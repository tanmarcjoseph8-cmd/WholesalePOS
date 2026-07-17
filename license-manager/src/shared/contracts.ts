export type LicenseStatus = "ACTIVE" | "REPLACED" | "REVOKED" | "ARCHIVED";
export type LicenseType = "MONTHLY" | "YEARLY" | "LIFETIME";
export type LicenseDisplayStatus = "ACTIVE" | "EXPIRING_SOON" | "EXPIRED" | "LIFETIME" | "REPLACED" | "REVOKED" | "ARCHIVED";
export type ActivationEventType = "GENERATED" | "RENEWED" | "REISSUED" | "REPLACED" | "REACTIVATED" | "REVOKED" | "ARCHIVED" | "IMPORTED";

export type CustomerRecord = {
  id: string;
  customerName: string;
  businessName: string;
  contactNumber: string;
  email: string;
  notes: string;
  createdAt: string;
  lastModifiedAt: string;
};

export type LicensedProduct = {
  id: string;
  productName: string;
  productVersion: string;
  edition: string;
  active: boolean;
};

export type LicenseRecord = {
  id: string;
  customerId: string;
  deviceId: string;
  activationCode: string;
  activationDate: string;
  lastModifiedDate: string;
  appVersion: string;
  productId: string;
  productName: string;
  productVersion: string;
  edition: string;
  notes: string;
  status: LicenseStatus;
  licenseType: LicenseType;
  issueDate: string;
  expirationDate: string | null;
  licenseSerialNumber: string;
  replacementForLicenseId: string | null;
  replacedByLicenseId: string | null;
  replacementDate: string | null;
  renewalForLicenseId: string | null;
  renewedByLicenseId: string | null;
  renewalDate: string | null;
};

export type ActivationEvent = {
  id: string;
  timestamp: string;
  type: ActivationEventType;
  customerId: string;
  licenseId: string;
  customerName: string;
  deviceId: string;
  activationCode: string;
  softwareVersion: string;
  notes: string;
  oldExpirationDate: string | null;
  newExpirationDate: string | null;
  licenseType: LicenseType;
};

export type BrandingSettings = {
  companyName: string;
  contactInformation: string;
  logoDataUrl: string;
};

export type LicenseManagerPreferences = {
  autoBackup: boolean;
  autoLockMinutes: number;
};

export type LegacyActivationPayload = {
  format: "WPOS-LICENSE";
  version: 1;
  licenseId: string;
  deviceId: string;
  productId: string;
  productName: string;
  productVersion: string;
  edition: string;
  issuedAt: string;
};

export type RenewableActivationPayload = {
  format: "WPOS-LICENSE";
  version: 2;
  licenseId: string;
  licenseSerialNumber: string;
  customerId: string;
  deviceId: string;
  productId: string;
  productName: string;
  productVersion: string;
  edition: string;
  licenseType: LicenseType;
  issuedAt: string;
  expiresAt: string | null;
};

export type ActivationPayload = LegacyActivationPayload | RenewableActivationPayload;

export type LicenseVaultData = {
  schemaVersion: 1;
  authorityId: string;
  publicKeyJwk: JsonWebKey;
  privateKeyPem: string;
  customers: CustomerRecord[];
  licenses: LicenseRecord[];
  activationEvents: ActivationEvent[];
  products: LicensedProduct[];
  branding: BrandingSettings;
  preferences: LicenseManagerPreferences;
};

export type LicenseListItem = LicenseRecord & { customer: CustomerRecord; displayStatus: LicenseDisplayStatus; daysRemaining: number | null };

export type ManagerSnapshot = {
  customers: CustomerRecord[];
  licenses: LicenseListItem[];
  activationEvents: ActivationEvent[];
  products: LicensedProduct[];
  branding: BrandingSettings;
  preferences: LicenseManagerPreferences;
  publicKeyFingerprint: string;
};

export type CreateLicenseInput = {
  customerId?: string;
  customerName: string;
  businessName: string;
  contactNumber: string;
  email: string;
  customerNotes: string;
  deviceId: string;
  productId: string;
  appVersion: string;
  licenseNotes: string;
  licenseType: LicenseType;
};

export type RenewLicenseInput = {
  licenseId: string;
  deviceId: string;
  licenseType: LicenseType;
  administratorNotes: string;
};

export type CreateLicenseResult =
  | { kind: "CREATED"; license: LicenseListItem }
  | { kind: "DUPLICATE"; existing: LicenseListItem };

export type SetupInput = { password: string; companyName: string; contactInformation: string };
export type AppLockStatus = { provisioned: boolean; unlocked: boolean; bootstrapReady: boolean };

export type LicenseManagerApi = {
  status(): Promise<AppLockStatus>;
  setup(input: SetupInput): Promise<ManagerSnapshot>;
  unlock(password: string): Promise<ManagerSnapshot>;
  lock(): Promise<void>;
  touch(): Promise<void>;
  snapshot(): Promise<ManagerSnapshot>;
  createLicense(input: CreateLicenseInput): Promise<CreateLicenseResult>;
  renewLicense(input: RenewLicenseInput): Promise<LicenseListItem>;
  reissueLicense(licenseId: string, notes: string): Promise<LicenseListItem>;
  replaceDevice(input: { licenseId: string; newDeviceId: string; appVersion: string; notes: string }): Promise<LicenseListItem>;
  setLicenseStatus(input: { licenseId: string; status: Exclude<LicenseStatus, "REPLACED">; notes: string }): Promise<LicenseListItem>;
  saveCustomer(customer: Pick<CustomerRecord, "id" | "customerName" | "businessName" | "contactNumber" | "email" | "notes">): Promise<CustomerRecord>;
  saveBranding(branding: BrandingSettings): Promise<BrandingSettings>;
  savePreferences(preferences: LicenseManagerPreferences): Promise<LicenseManagerPreferences>;
  addProduct(product: Omit<LicensedProduct, "id">): Promise<LicensedProduct>;
  changePassword(input: { currentPassword: string; newPassword: string }): Promise<void>;
  manualBackup(): Promise<string | null>;
  restoreBackup(password: string): Promise<ManagerSnapshot | null>;
  exportCsv(): Promise<string | null>;
  exportExcel(): Promise<string | null>;
  importSpreadsheet(): Promise<{ imported: number; skipped: number; errors: string[] } | null>;
  printLicense(licenseId: string): Promise<void>;
  exportLicensePdf(licenseId: string): Promise<string | null>;
};

export const LICENSE_MANAGER_CHANNELS = {
  status: "license-manager:status",
  setup: "license-manager:setup",
  unlock: "license-manager:unlock",
  lock: "license-manager:lock",
  touch: "license-manager:touch",
  snapshot: "license-manager:snapshot",
  createLicense: "license-manager:create-license",
  renewLicense: "license-manager:renew-license",
  reissueLicense: "license-manager:reissue-license",
  replaceDevice: "license-manager:replace-device",
  setLicenseStatus: "license-manager:set-license-status",
  saveCustomer: "license-manager:save-customer",
  saveBranding: "license-manager:save-branding",
  savePreferences: "license-manager:save-preferences",
  addProduct: "license-manager:add-product",
  changePassword: "license-manager:change-password",
  manualBackup: "license-manager:manual-backup",
  restoreBackup: "license-manager:restore-backup",
  exportCsv: "license-manager:export-csv",
  exportExcel: "license-manager:export-excel",
  importSpreadsheet: "license-manager:import-spreadsheet",
  printLicense: "license-manager:print-license",
  exportLicensePdf: "license-manager:export-license-pdf"
} as const;
