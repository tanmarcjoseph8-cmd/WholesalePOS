import { randomBytes, randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type {
  ActivationEvent,
  BrandingSettings,
  CreateLicenseInput,
  CreateLicenseResult,
  CustomerRecord,
  LicenseListItem,
  LicenseManagerPreferences,
  LicenseRecord,
  LicenseStatus,
  LicenseType,
  LicenseVaultData,
  LicensedProduct,
  ManagerSnapshot,
  RenewLicenseInput
} from "../shared/contracts.js";
import {
  createActivationCode,
  decryptVault,
  deriveVaultKey,
  encryptVault,
  encryptVaultWithKey,
  publicKeyFingerprint,
  type EncryptedVaultEnvelope,
  verifyActivationCode
} from "./crypto.js";

export type ImportedLicenseRow = {
  customerName: string;
  businessName: string;
  contactNumber: string;
  email: string;
  deviceId: string;
  activationCode: string;
  activationDate: string;
  appVersion: string;
  productName: string;
  productVersion: string;
  edition: string;
  notes: string;
  status: LicenseStatus;
};

const now = () => new Date().toISOString();
const clean = (value: string) => value.trim();
const cleanDeviceId = (value: string) => value.trim().toUpperCase();
const DAY_MS = 24 * 60 * 60 * 1000;

function addUtcMonths(value: Date, months: number) {
  const result = new Date(value);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function expirationFor(issuedAt: string, licenseType: LicenseType) {
  if (licenseType === "LIFETIME") return null;
  return addUtcMonths(new Date(issuedAt), licenseType === "MONTHLY" ? 1 : 12).toISOString();
}

function serialNumber(issuedAt: string) {
  return `WPOS-${issuedAt.slice(0, 4)}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function defaultProducts(): LicensedProduct[] {
  return [
    { id: "WHOLESALE_POS_ANDROID", productName: "Suki Sync Android", productVersion: "0.7.0", edition: "Restaurant", active: true },
    { id: "POS_STANDARD", productName: "POS Standard", productVersion: "1.0", edition: "Standard", active: true },
    { id: "INVENTORY_PRO", productName: "Inventory Pro", productVersion: "1.0", edition: "Pro", active: true }
  ];
}

/** Owns the password-encrypted offline license database and all immutable licensing workflows. */
export class LicenseVaultStore {
  private data: LicenseVaultData | null = null;
  private key: Buffer | null = null;
  private salt: Buffer | null = null;

  constructor(private readonly vaultPath: string, private readonly backupDirectory: string) {}

  /** Reports whether the encrypted database exists without attempting to decrypt it. */
  async isProvisioned() {
    try { return (await stat(this.vaultPath)).isFile(); } catch { return false; }
  }

  /** Creates the first encrypted database from a DPAPI-unwrapped signing authority. */
  async setup(input: { password: string; companyName: string; contactInformation: string; privateKeyPem: string; publicKeyJwk: JsonWebKey }) {
    if (await this.isProvisioned()) throw new Error("License Manager is already provisioned.");
    const createdAt = now();
    const data: LicenseVaultData = {
      schemaVersion: 1,
      authorityId: randomUUID(),
      privateKeyPem: input.privateKeyPem,
      publicKeyJwk: input.publicKeyJwk,
      customers: [],
      licenses: [],
      activationEvents: [],
      products: defaultProducts(),
      branding: { companyName: clean(input.companyName) || "WholesalePOS", contactInformation: clean(input.contactInformation), logoDataUrl: "" },
      preferences: { autoBackup: true, autoLockMinutes: 10 }
    };
    const envelope = encryptVault(data, input.password);
    await this.writeEnvelope(envelope);
    await this.unlock(input.password);
    await this.writeAuditBackup(`initial-${createdAt.replace(/[:.]/g, "-")}.wposvault`);
    return this.snapshot();
  }

  /** Unlocks the database using the administrator password. */
  async unlock(password: string) {
    const envelope = JSON.parse(await readFile(this.vaultPath, "utf8")) as EncryptedVaultEnvelope;
    const unlocked = decryptVault(envelope, password);
    this.lock();
    this.data = this.normalizeVault(unlocked.data);
    this.key = unlocked.key;
    this.salt = unlocked.salt;
    return this.snapshot();
  }

  /** Wipes practical in-memory key material and returns the application to its locked state. */
  lock() {
    this.key?.fill(0);
    this.salt?.fill(0);
    if (this.data) this.data.privateKeyPem = "";
    this.key = null;
    this.salt = null;
    this.data = null;
  }

  /** Returns a renderer-safe snapshot that never includes the signing key. */
  snapshot(): ManagerSnapshot {
    const data = this.requireUnlocked();
    return {
      customers: structuredClone(data.customers),
      licenses: data.licenses.map((license) => this.toListItem(license)),
      activationEvents: structuredClone(data.activationEvents),
      products: structuredClone(data.products),
      branding: structuredClone(data.branding),
      preferences: structuredClone(data.preferences),
      publicKeyFingerprint: publicKeyFingerprint(data.publicKeyJwk)
    };
  }

  /** Creates a signed license or returns the existing matching Device ID without duplicating it. */
  async createLicense(input: CreateLicenseInput): Promise<CreateLicenseResult> {
    const data = this.requireUnlocked();
    const deviceId = cleanDeviceId(input.deviceId);
    if (!deviceId) throw new Error("Device ID is required.");
    const duplicate = data.licenses.find((license) => license.deviceId === deviceId);
    if (duplicate) return { kind: "DUPLICATE", existing: this.toListItem(duplicate) };
    const product = data.products.find((entry) => entry.id === input.productId && entry.active);
    if (!product) throw new Error("Select an active product.");
    const customer = this.resolveCustomer(input);
    const license = this.buildLicense(customer, deviceId, product, input.appVersion, input.licenseNotes, { licenseType: input.licenseType });
    data.licenses.push(license);
    this.appendEvent("GENERATED", customer, license, input.licenseNotes);
    await this.save();
    return { kind: "CREATED", license: this.toListItem(license) };
  }

  /** Generates a new signed entitlement for the same tablet while permanently preserving the previous license. */
  async renewLicense(input: RenewLicenseInput) {
    const data = this.requireUnlocked();
    const previous = this.requireLicense(input.licenseId);
    const deviceId = cleanDeviceId(input.deviceId);
    if (deviceId !== previous.deviceId) throw new Error("Device ID does not match the selected license.");
    if (previous.status === "REPLACED" || previous.status === "REVOKED") throw new Error("This historical license cannot be renewed.");
    if (data.licenses.some((license) => license.id !== previous.id && license.deviceId === deviceId && license.status === "ACTIVE")) throw new Error("Select the current active license for this Device ID.");
    const customer = this.requireCustomer(previous.customerId);
    const product = data.products.find((entry) => entry.id === previous.productId);
    if (!product) throw new Error("The licensed product is no longer configured.");
    const renewed = this.buildLicense(customer, deviceId, product, previous.appVersion, input.administratorNotes, { licenseType: input.licenseType, renewalForLicenseId: previous.id });
    const renewedAt = now();
    previous.status = "ARCHIVED";
    previous.renewedByLicenseId = renewed.id;
    previous.renewalDate = renewedAt;
    previous.lastModifiedDate = renewedAt;
    data.licenses.push(renewed);
    this.appendEvent("RENEWED", customer, renewed, input.administratorNotes || `Renewed ${previous.licenseSerialNumber}.`, previous.expirationDate, renewed.expirationDate);
    await this.save();
    return this.toListItem(renewed);
  }

  /** Records a permanent reissue event while returning the exact original activation code. */
  async reissueLicense(licenseId: string, notes: string) {
    const license = this.requireLicense(licenseId);
    const customer = this.requireCustomer(license.customerId);
    this.appendEvent("REISSUED", customer, license, notes || "Activation code reissued for the same device.");
    license.lastModifiedDate = now();
    await this.save();
    return this.toListItem(license);
  }

  /** Replaces a device without overwriting either the old license or its activation history. */
  async replaceDevice(input: { licenseId: string; newDeviceId: string; appVersion: string; notes: string }) {
    const data = this.requireUnlocked();
    const oldLicense = this.requireLicense(input.licenseId);
    if (oldLicense.status === "REPLACED") throw new Error("This device has already been replaced.");
    const newDeviceId = cleanDeviceId(input.newDeviceId);
    if (!newDeviceId) throw new Error("New Device ID is required.");
    if (data.licenses.some((license) => license.deviceId === newDeviceId)) throw new Error("The new Device ID already has a license.");
    const customer = this.requireCustomer(oldLicense.customerId);
    const product = data.products.find((entry) => entry.id === oldLicense.productId);
    if (!product) throw new Error("The licensed product is no longer configured.");
    const replacement = this.buildLicense(customer, newDeviceId, product, input.appVersion || oldLicense.appVersion, input.notes, { replacementForLicenseId: oldLicense.id, licenseType: oldLicense.licenseType, expirationDate: oldLicense.expirationDate });
    const replacedAt = now();
    oldLicense.status = "REPLACED";
    oldLicense.replacedByLicenseId = replacement.id;
    oldLicense.replacementDate = replacedAt;
    oldLicense.lastModifiedDate = replacedAt;
    data.licenses.push(replacement);
    this.appendEvent("REPLACED", customer, oldLicense, input.notes || `Replaced by ${newDeviceId}.`);
    this.appendEvent("GENERATED", customer, replacement, input.notes || `Replacement for ${oldLicense.deviceId}.`);
    await this.save();
    return this.toListItem(replacement);
  }

  /** Changes revocation or archival status and appends an immutable history event. */
  async setLicenseStatus(input: { licenseId: string; status: Exclude<LicenseStatus, "REPLACED">; notes: string }) {
    const license = this.requireLicense(input.licenseId);
    if (license.status === "REPLACED") throw new Error("A replaced historical license cannot be reactivated.");
    license.status = input.status;
    license.notes = clean(input.notes) || license.notes;
    license.lastModifiedDate = now();
    const customer = this.requireCustomer(license.customerId);
    this.appendEvent(input.status === "ACTIVE" ? "REACTIVATED" : input.status === "REVOKED" ? "REVOKED" : "ARCHIVED", customer, license, input.notes);
    await this.save();
    return this.toListItem(license);
  }

  /** Updates customer contact details while retaining all license and event records. */
  async saveCustomer(input: Pick<CustomerRecord, "id" | "customerName" | "businessName" | "contactNumber" | "email" | "notes">) {
    const customer = this.requireCustomer(input.id);
    customer.customerName = clean(input.customerName);
    customer.businessName = clean(input.businessName);
    customer.contactNumber = clean(input.contactNumber);
    customer.email = clean(input.email);
    customer.notes = clean(input.notes);
    customer.lastModifiedAt = now();
    if (!customer.customerName || !customer.businessName) throw new Error("Customer and business names are required.");
    await this.save();
    return structuredClone(customer);
  }

  /** Saves company branding used by printable activation sheets. */
  async saveBranding(branding: BrandingSettings) {
    const data = this.requireUnlocked();
    if (branding.logoDataUrl && !/^data:image\/(png|jpeg|webp);base64,/i.test(branding.logoDataUrl)) throw new Error("Company logo must be a PNG, JPEG, or WebP image.");
    data.branding = { companyName: clean(branding.companyName) || "WholesalePOS", contactInformation: clean(branding.contactInformation), logoDataUrl: branding.logoDataUrl };
    await this.save();
    return structuredClone(data.branding);
  }

  /** Saves automatic-backup and inactivity-lock preferences. */
  async savePreferences(preferences: LicenseManagerPreferences) {
    const data = this.requireUnlocked();
    if (!Number.isInteger(preferences.autoLockMinutes) || preferences.autoLockMinutes < 1 || preferences.autoLockMinutes > 120) throw new Error("Automatic lock must be between 1 and 120 minutes.");
    data.preferences = structuredClone(preferences);
    await this.save();
    return structuredClone(data.preferences);
  }

  /** Adds a future licensed product without changing existing licenses. */
  async addProduct(input: Omit<LicensedProduct, "id">) {
    const data = this.requireUnlocked();
    const productName = clean(input.productName);
    const edition = clean(input.edition);
    const productVersion = clean(input.productVersion);
    if (!productName || !edition || !productVersion) throw new Error("Product name, version, and edition are required.");
    const idBase = `${productName}_${edition}`.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");
    let id = idBase;
    let suffix = 2;
    while (data.products.some((product) => product.id === id)) id = `${idBase}_${suffix++}`;
    const product: LicensedProduct = { id, productName, productVersion, edition, active: input.active };
    data.products.push(product);
    await this.save();
    return structuredClone(product);
  }

  /** Re-encrypts the complete database under a new administrator password. */
  async changePassword(currentPassword: string, newPassword: string) {
    const envelope = JSON.parse(await readFile(this.vaultPath, "utf8")) as EncryptedVaultEnvelope;
    const verified = decryptVault(envelope, currentPassword);
    verified.key.fill(0);
    verified.salt.fill(0);
    const data = this.requireUnlocked();
    const salt = randomBytes(16);
    const key = deriveVaultKey(newPassword, salt);
    const nextEnvelope = encryptVaultWithKey(data, key, salt);
    await this.writeEnvelope(nextEnvelope);
    this.key?.fill(0);
    this.salt?.fill(0);
    this.key = key;
    this.salt = salt;
  }

  /** Copies the encrypted database to an administrator-selected destination. */
  async copyEncryptedVault(destination: string) {
    this.requireUnlocked();
    await copyFile(this.vaultPath, destination);
  }

  /** Validates and replaces the encrypted database from a selected backup. */
  async restoreEncryptedVault(source: string, password: string) {
    const envelope = JSON.parse(await readFile(source, "utf8")) as EncryptedVaultEnvelope;
    const restored = decryptVault(envelope, password);
    restored.key.fill(0);
    restored.salt.fill(0);
    await this.writeAuditBackup(`before-restore-${now().replace(/[:.]/g, "-")}.wposvault`);
    await this.writeEnvelope(envelope);
    return this.unlock(password);
  }

  /** Imports a previously exported valid signed license without resigning or deleting history. */
  async importLicense(row: ImportedLicenseRow) {
    const data = this.requireUnlocked();
    const payload = verifyActivationCode(row.activationCode, data.publicKeyJwk);
    const deviceId = cleanDeviceId(row.deviceId);
    if (payload.deviceId !== deviceId) throw new Error("Activation code does not match the imported Device ID.");
    if (data.licenses.some((license) => license.deviceId === deviceId || license.id === payload.licenseId)) return false;
    let customer = data.customers.find((entry) => entry.customerName.toLowerCase() === clean(row.customerName).toLowerCase() && entry.businessName.toLowerCase() === clean(row.businessName).toLowerCase());
    if (!customer) {
      const timestamp = now();
      customer = { id: randomUUID(), customerName: clean(row.customerName), businessName: clean(row.businessName), contactNumber: clean(row.contactNumber), email: clean(row.email), notes: clean(row.notes), createdAt: timestamp, lastModifiedAt: timestamp };
      data.customers.push(customer);
    }
    const license: LicenseRecord = {
      id: payload.licenseId,
      customerId: customer.id,
      deviceId,
      activationCode: row.activationCode.trim(),
      activationDate: row.activationDate || payload.issuedAt,
      lastModifiedDate: now(),
      appVersion: clean(row.appVersion) || payload.productVersion,
      productId: payload.productId,
      productName: payload.productName,
      productVersion: payload.productVersion,
      edition: payload.edition,
      notes: clean(row.notes),
      status: row.status,
      licenseType: payload.version === 2 ? payload.licenseType : "LIFETIME",
      issueDate: payload.issuedAt,
      expirationDate: payload.version === 2 ? payload.expiresAt : null,
      licenseSerialNumber: payload.version === 2 ? payload.licenseSerialNumber : payload.licenseId,
      replacementForLicenseId: null,
      replacedByLicenseId: null,
      replacementDate: null,
      renewalForLicenseId: null,
      renewedByLicenseId: null,
      renewalDate: null
    };
    data.licenses.push(license);
    this.appendEvent("IMPORTED", customer, license, "Imported from a verified spreadsheet export.");
    await this.save();
    return true;
  }

  /** Returns one complete renderer-safe record for printing and QR generation. */
  getLicense(licenseId: string) {
    return this.toListItem(this.requireLicense(licenseId));
  }

  /** Exposes the configured branding without exposing vault secrets. */
  getBranding() {
    return structuredClone(this.requireUnlocked().branding);
  }

  private requireUnlocked() {
    if (!this.data || !this.key || !this.salt) throw new Error("License Manager is locked.");
    return this.data;
  }

  private requireLicense(id: string) {
    const license = this.requireUnlocked().licenses.find((entry) => entry.id === id);
    if (!license) throw new Error("License record was not found.");
    return license;
  }

  private requireCustomer(id: string) {
    const customer = this.requireUnlocked().customers.find((entry) => entry.id === id);
    if (!customer) throw new Error("Customer record was not found.");
    return customer;
  }

  private resolveCustomer(input: CreateLicenseInput) {
    const data = this.requireUnlocked();
    if (input.customerId) return this.requireCustomer(input.customerId);
    const timestamp = now();
    const customer: CustomerRecord = {
      id: randomUUID(), customerName: clean(input.customerName), businessName: clean(input.businessName), contactNumber: clean(input.contactNumber), email: clean(input.email), notes: clean(input.customerNotes), createdAt: timestamp, lastModifiedAt: timestamp
    };
    if (!customer.customerName || !customer.businessName) throw new Error("Customer and business names are required.");
    data.customers.push(customer);
    return customer;
  }

  private buildLicense(customer: CustomerRecord, deviceId: string, product: LicensedProduct, appVersion: string, notes: string, options: { licenseType: LicenseType; replacementForLicenseId?: string | null; renewalForLicenseId?: string | null; expirationDate?: string | null }) {
    const data = this.requireUnlocked();
    const issuedAt = now();
    const id = randomUUID();
    const licenseSerialNumber = serialNumber(issuedAt);
    const expirationDate = options.expirationDate === undefined ? expirationFor(issuedAt, options.licenseType) : options.expirationDate;
    const activationCode = createActivationCode(data.privateKeyPem, { format: "WPOS-LICENSE", version: 2, licenseId: id, licenseSerialNumber, customerId: customer.id, deviceId, productId: product.id, productName: product.productName, productVersion: product.productVersion, edition: product.edition, licenseType: options.licenseType, issuedAt, expiresAt: expirationDate });
    return {
      id, customerId: customer.id, deviceId, activationCode, activationDate: issuedAt, lastModifiedDate: issuedAt,
      appVersion: clean(appVersion) || product.productVersion, productId: product.id, productName: product.productName,
      productVersion: product.productVersion, edition: product.edition, notes: clean(notes), status: "ACTIVE" as const,
      licenseType: options.licenseType, issueDate: issuedAt, expirationDate, licenseSerialNumber,
      replacementForLicenseId: options.replacementForLicenseId ?? null, replacedByLicenseId: null, replacementDate: null,
      renewalForLicenseId: options.renewalForLicenseId ?? null, renewedByLicenseId: null, renewalDate: options.renewalForLicenseId ? issuedAt : null
    } satisfies LicenseRecord;
  }

  private appendEvent(type: ActivationEvent["type"], customer: CustomerRecord, license: LicenseRecord, notes: string, oldExpirationDate: string | null = null, newExpirationDate: string | null = license.expirationDate) {
    this.requireUnlocked().activationEvents.push({ id: randomUUID(), timestamp: now(), type, customerId: customer.id, licenseId: license.id, customerName: customer.customerName, deviceId: license.deviceId, activationCode: license.activationCode, softwareVersion: license.appVersion, notes: clean(notes), oldExpirationDate, newExpirationDate, licenseType: license.licenseType });
  }

  private toListItem(license: LicenseRecord): LicenseListItem {
    const daysRemaining = license.expirationDate === null ? null : Math.max(0, Math.ceil((Date.parse(license.expirationDate) - Date.now()) / DAY_MS));
    const displayStatus = license.status !== "ACTIVE" ? license.status : license.licenseType === "LIFETIME" ? "LIFETIME" : Date.now() > Date.parse(license.expirationDate!) ? "EXPIRED" : daysRemaining! <= 30 ? "EXPIRING_SOON" : "ACTIVE";
    return { ...structuredClone(license), customer: structuredClone(this.requireCustomer(license.customerId)), displayStatus, daysRemaining };
  }

  private normalizeVault(data: LicenseVaultData) {
    const androidProduct = data.products.find((product) => product.id === "WHOLESALE_POS_ANDROID");
    if (androidProduct) { androidProduct.productName = "Suki Sync Android"; androidProduct.productVersion = "0.7.0"; }
    for (const license of data.licenses) {
      const legacy = license as LicenseRecord & Record<string, unknown>;
      legacy.licenseType = (legacy.licenseType as LicenseType | undefined) ?? "LIFETIME";
      legacy.issueDate = (legacy.issueDate as string | undefined) ?? license.activationDate;
      legacy.expirationDate = (legacy.expirationDate as string | null | undefined) ?? null;
      legacy.licenseSerialNumber = (legacy.licenseSerialNumber as string | undefined) ?? license.id;
      legacy.renewalForLicenseId = (legacy.renewalForLicenseId as string | null | undefined) ?? null;
      legacy.renewedByLicenseId = (legacy.renewedByLicenseId as string | null | undefined) ?? null;
      legacy.renewalDate = (legacy.renewalDate as string | null | undefined) ?? null;
    }
    for (const event of data.activationEvents) {
      const legacy = event as ActivationEvent & Record<string, unknown>;
      const license = data.licenses.find((entry) => entry.id === event.licenseId);
      legacy.oldExpirationDate = (legacy.oldExpirationDate as string | null | undefined) ?? null;
      legacy.newExpirationDate = (legacy.newExpirationDate as string | null | undefined) ?? license?.expirationDate ?? null;
      legacy.licenseType = (legacy.licenseType as LicenseType | undefined) ?? license?.licenseType ?? "LIFETIME";
    }
    return data;
  }

  private async save() {
    const data = this.requireUnlocked();
    const envelope = encryptVaultWithKey(data, this.key!, this.salt!);
    await this.writeEnvelope(envelope);
    if (data.preferences.autoBackup) await this.writeAuditBackup(`auto-${now().replace(/[:.]/g, "-")}.wposvault`);
  }

  private async writeEnvelope(envelope: EncryptedVaultEnvelope) {
    await mkdir(dirname(this.vaultPath), { recursive: true });
    const temporary = `${this.vaultPath}.tmp`;
    await writeFile(temporary, JSON.stringify(envelope), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, this.vaultPath);
  }

  private async writeAuditBackup(fileName: string) {
    if (!(await this.isProvisioned())) return;
    await mkdir(this.backupDirectory, { recursive: true });
    await copyFile(this.vaultPath, join(this.backupDirectory, fileName));
    const files = (await readdir(this.backupDirectory)).filter((file) => file.endsWith(".wposvault")).sort().reverse();
    await Promise.all(files.slice(30).map((file) => rm(join(this.backupDirectory, file), { force: true })));
  }
}
