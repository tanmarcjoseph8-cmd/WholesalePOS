import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { spawnSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";
import * as XLSX from "xlsx";
import type { BrandingSettings, LicenseListItem, LicenseManagerApi, LicenseManagerPreferences, LicenseStatus } from "../shared/contracts.js";
import { LICENSE_MANAGER_CHANNELS } from "../shared/contracts.js";
import { AUTHORITY_PUBLIC_KEY_JWK } from "../shared/authority-public-key.js";
import { publicKeyFingerprint } from "./crypto.js";
import { configureLicenseManagerPaths, licenseManagerPaths } from "./paths.js";
import { LicenseVaultStore, type ImportedLicenseRow } from "./store.js";

type AuthorityBootstrap = {
  format: "wholesalepos-license-authority-bootstrap";
  version: 1;
  publicKeyJwk: JsonWebKey;
  protection: "windows-dpapi-current-user";
  encryptedPrivateKey: string;
  createdAt: string;
};

configureLicenseManagerPaths();
const paths = licenseManagerPaths();
const store = new LicenseVaultStore(paths.vault, paths.backups);
let mainWindow: BrowserWindow | null = null;
let autoLockTimer: ReturnType<typeof setTimeout> | null = null;

function safeError(error: unknown) {
  return error instanceof Error ? new Error(error.message) : new Error("The License Manager operation failed.");
}

function register<TArgs extends unknown[], TResult>(channel: string, handler: (...args: TArgs) => Promise<TResult> | TResult, requiresUnlock = true) {
  ipcMain.handle(channel, async (_event, ...args: TArgs) => {
    try {
      const result = await handler(...args);
      if (requiresUnlock) touchAutoLock();
      return result;
    } catch (error) {
      throw safeError(error);
    }
  });
}

function touchAutoLock() {
  if (autoLockTimer) clearTimeout(autoLockTimer);
  try {
    const minutes = store.snapshot().preferences.autoLockMinutes;
    autoLockTimer = setTimeout(() => {
      store.lock();
      mainWindow?.webContents.send("license-manager:auto-locked");
    }, minutes * 60_000);
  } catch {
    autoLockTimer = null;
  }
}

async function readBootstrap() {
  const bootstrap = JSON.parse(await readFile(paths.bootstrap, "utf8")) as AuthorityBootstrap;
  if (bootstrap.format !== "wholesalepos-license-authority-bootstrap" || bootstrap.version !== 1 || !bootstrap.encryptedPrivateKey) throw new Error("The signing-authority provisioning file is invalid.");
  if (publicKeyFingerprint(bootstrap.publicKeyJwk) !== publicKeyFingerprint(AUTHORITY_PUBLIC_KEY_JWK)) throw new Error("The provisioned signing authority does not match this Android build.");
  if (bootstrap.protection !== "windows-dpapi-current-user") throw new Error("The signing-authority protection method is unsupported.");
  const command = "Add-Type -AssemblyName System.Security;$value=[Console]::In.ReadToEnd();$protected=[Convert]::FromBase64String($value);$bytes=[System.Security.Cryptography.ProtectedData]::Unprotect($protected,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Convert]::ToBase64String($bytes));[Array]::Clear($bytes,0,$bytes.Length)";
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], { input: bootstrap.encryptedPrivateKey, maxBuffer: 1024 * 1024 });
  if (result.status !== 0 || !result.stdout.length) throw new Error("Windows could not unlock the signing authority for this user account.");
  const privateKeyBytes = Buffer.from(result.stdout.toString("utf8").trim(), "base64");
  try { return { ...bootstrap, privateKeyPem: privateKeyBytes.toString("utf8") }; }
  finally { privateKeyBytes.fill(0); }
}

function exportRows(snapshot = store.snapshot()) {
  return snapshot.licenses.map((license) => ({
    "Customer Name": license.customer.customerName,
    "Business Name": license.customer.businessName,
    "Contact Number": license.customer.contactNumber,
    Email: license.customer.email,
    "Device ID": license.deviceId,
    "Activation Code": license.activationCode,
    "Activation Date": license.activationDate,
    "Last Modified Date": license.lastModifiedDate,
    "App Version": license.appVersion,
    "Product Name": license.productName,
    "Product Version": license.productVersion,
    Edition: license.edition,
    "License Type": license.licenseType,
    "Issue Date": license.issueDate,
    "Expiration Date": license.expirationDate ?? "Lifetime",
    "Days Remaining": license.daysRemaining ?? "Unlimited",
    "Effective Status": license.displayStatus,
    "License Serial Number": license.licenseSerialNumber,
    Notes: license.notes,
    "License Status": license.status
  }));
}

function parseImportRow(row: Record<string, unknown>): ImportedLicenseRow {
  const text = (key: string) => String(row[key] ?? "").trim();
  const status = text("License Status").toUpperCase() as LicenseStatus;
  if (!(["ACTIVE", "REPLACED", "REVOKED", "ARCHIVED"] as const).includes(status)) throw new Error("License Status must be Active, Replaced, Revoked, or Archived.");
  const parsed = {
    customerName: text("Customer Name"), businessName: text("Business Name"), contactNumber: text("Contact Number"), email: text("Email"),
    deviceId: text("Device ID"), activationCode: text("Activation Code"), activationDate: text("Activation Date"), appVersion: text("App Version"),
    productName: text("Product Name"), productVersion: text("Product Version"), edition: text("Edition"), notes: text("Notes"), status
  };
  if (!parsed.customerName || !parsed.businessName || !parsed.deviceId || !parsed.activationCode) throw new Error("Customer Name, Business Name, Device ID, and Activation Code are required.");
  return parsed;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

async function activationSheetHtml(license: LicenseListItem, branding: BrandingSettings) {
  const qrData = await QRCode.toDataURL(JSON.stringify({ deviceId: license.deviceId, activationCode: license.activationCode }), { errorCorrectionLevel: "M", margin: 1, width: 320 });
  const logo = branding.logoDataUrl ? `<img class="logo" src="${branding.logoDataUrl}" alt="Company logo">` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>Activation Sheet</title><style>
    @page{size:A4;margin:18mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#111827;margin:0}.head{display:flex;align-items:center;gap:18px;border-bottom:3px solid #0f766e;padding-bottom:18px}.logo{width:72px;height:72px;object-fit:contain}.head h1{margin:0;font-size:26px}.head p{margin:6px 0 0;color:#475569;white-space:pre-line}.title{margin:34px 0 8px;font-size:22px}.sub{color:#64748b;margin:0 0 28px}.grid{display:grid;grid-template-columns:1fr 210px;gap:30px}.details{border:1px solid #cbd5e1;border-radius:6px;overflow:hidden}.row{display:grid;grid-template-columns:150px 1fr;border-bottom:1px solid #e2e8f0}.row:last-child{border:0}.row b,.row span{padding:12px}.row b{background:#f1f5f9}.code{font-family:Consolas,monospace;font-size:11px;word-break:break-all}.qr{text-align:center}.qr img{width:190px}.qr p{font-size:12px;color:#64748b}.foot{margin-top:32px;padding-top:18px;border-top:1px solid #cbd5e1;color:#64748b;font-size:12px}</style></head><body>
    <header class="head">${logo}<div><h1>${escapeHtml(branding.companyName)}</h1><p>${escapeHtml(branding.contactInformation)}</p></div></header>
    <h2 class="title">Software Activation Certificate</h2><p class="sub">Keep this sheet in a secure place as proof of activation.</p>
    <div class="grid"><div class="details">
      <div class="row"><b>Customer</b><span>${escapeHtml(license.customer.customerName)}</span></div><div class="row"><b>Business</b><span>${escapeHtml(license.customer.businessName)}</span></div>
      <div class="row"><b>Product</b><span>${escapeHtml(`${license.productName} ${license.edition}`)}</span></div><div class="row"><b>Device ID</b><span>${escapeHtml(license.deviceId)}</span></div>
      <div class="row"><b>License serial</b><span>${escapeHtml(license.licenseSerialNumber)}</span></div><div class="row"><b>License type</b><span>${escapeHtml(license.licenseType)}</span></div>
      <div class="row"><b>Issue date</b><span>${escapeHtml(new Date(license.issueDate).toLocaleString())}</span></div><div class="row"><b>Expiration</b><span>${escapeHtml(license.expirationDate ? new Date(license.expirationDate).toLocaleString() : "Lifetime")}</span></div>
      <div class="row"><b>Status</b><span>${escapeHtml(license.displayStatus.replaceAll("_", " "))}</span></div>
      <div class="row"><b>Activation code</b><span class="code">${escapeHtml(license.activationCode)}</span></div>
    </div><div class="qr"><img src="${qrData}" alt="Activation QR code"><p>Scan this QR code on the matching Android tablet.</p></div></div>
    <p class="foot">This certificate is bound to Device ID ${escapeHtml(license.deviceId)}. The activation code is valid only for the signed product and device shown above.</p>
  </body></html>`;
}

async function createPrintWindow(html: string) {
  const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  await printWindow.loadURL(`data:text/html;base64,${Buffer.from(html).toString("base64")}`);
  return printWindow;
}

function registerIpc() {
  register(LICENSE_MANAGER_CHANNELS.status, async () => ({ provisioned: await store.isProvisioned(), unlocked: (() => { try { store.snapshot(); return true; } catch { return false; } })(), bootstrapReady: await readFile(paths.bootstrap).then(() => true).catch(() => false) }), false);
  register(LICENSE_MANAGER_CHANNELS.setup, async (input: Parameters<LicenseManagerApi["setup"]>[0]) => {
    const bootstrap = await readBootstrap();
    const result = await store.setup({ ...input, privateKeyPem: bootstrap.privateKeyPem, publicKeyJwk: bootstrap.publicKeyJwk });
    await rm(paths.bootstrap, { force: true });
    touchAutoLock();
    return result;
  }, false);
  register(LICENSE_MANAGER_CHANNELS.unlock, async (password: string) => { const result = await store.unlock(password); touchAutoLock(); return result; }, false);
  register(LICENSE_MANAGER_CHANNELS.lock, async () => { store.lock(); if (autoLockTimer) clearTimeout(autoLockTimer); }, false);
  register(LICENSE_MANAGER_CHANNELS.touch, async () => undefined);
  register(LICENSE_MANAGER_CHANNELS.snapshot, async () => store.snapshot());
  register(LICENSE_MANAGER_CHANNELS.createLicense, async (input: Parameters<LicenseManagerApi["createLicense"]>[0]) => store.createLicense(input));
  register(LICENSE_MANAGER_CHANNELS.renewLicense, async (input: Parameters<LicenseManagerApi["renewLicense"]>[0]) => store.renewLicense(input));
  register(LICENSE_MANAGER_CHANNELS.reissueLicense, async (licenseId: string, notes: string) => store.reissueLicense(licenseId, notes));
  register(LICENSE_MANAGER_CHANNELS.replaceDevice, async (input: Parameters<LicenseManagerApi["replaceDevice"]>[0]) => store.replaceDevice(input));
  register(LICENSE_MANAGER_CHANNELS.setLicenseStatus, async (input: Parameters<LicenseManagerApi["setLicenseStatus"]>[0]) => store.setLicenseStatus(input));
  register(LICENSE_MANAGER_CHANNELS.saveCustomer, async (input: Parameters<LicenseManagerApi["saveCustomer"]>[0]) => store.saveCustomer(input));
  register(LICENSE_MANAGER_CHANNELS.saveBranding, async (input: Parameters<LicenseManagerApi["saveBranding"]>[0]) => store.saveBranding(input));
  register(LICENSE_MANAGER_CHANNELS.savePreferences, async (input: LicenseManagerPreferences) => store.savePreferences(input));
  register(LICENSE_MANAGER_CHANNELS.addProduct, async (input: Parameters<LicenseManagerApi["addProduct"]>[0]) => store.addProduct(input));
  register(LICENSE_MANAGER_CHANNELS.changePassword, async (input: Parameters<LicenseManagerApi["changePassword"]>[0]) => store.changePassword(input.currentPassword, input.newPassword));
  register(LICENSE_MANAGER_CHANNELS.manualBackup, async () => {
    const result = await dialog.showSaveDialog(mainWindow!, { title: "Export encrypted License Manager backup", defaultPath: `WholesalePOS-License-Backup-${new Date().toISOString().slice(0, 10)}.wposvault`, filters: [{ name: "Encrypted License Vault", extensions: ["wposvault"] }] });
    if (result.canceled || !result.filePath) return null;
    await store.copyEncryptedVault(result.filePath); return result.filePath;
  });
  register(LICENSE_MANAGER_CHANNELS.restoreBackup, async (password: string) => {
    const result = await dialog.showOpenDialog(mainWindow!, { title: "Restore encrypted License Manager backup", properties: ["openFile"], filters: [{ name: "Encrypted License Vault", extensions: ["wposvault"] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    const restored = await store.restoreEncryptedVault(result.filePaths[0], password); touchAutoLock(); return restored;
  }, false);
  register(LICENSE_MANAGER_CHANNELS.exportCsv, async () => {
    const result = await dialog.showSaveDialog(mainWindow!, { defaultPath: "WholesalePOS-Licenses.csv", filters: [{ name: "CSV", extensions: ["csv"] }] });
    if (result.canceled || !result.filePath) return null;
    const sheet = XLSX.utils.json_to_sheet(exportRows()); await writeFile(result.filePath, XLSX.utils.sheet_to_csv(sheet), "utf8"); return result.filePath;
  });
  register(LICENSE_MANAGER_CHANNELS.exportExcel, async () => {
    const result = await dialog.showSaveDialog(mainWindow!, { defaultPath: "WholesalePOS-Licenses.xlsx", filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }] });
    if (result.canceled || !result.filePath) return null;
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportRows()), "Licenses"); XLSX.writeFile(workbook, result.filePath); return result.filePath;
  });
  register(LICENSE_MANAGER_CHANNELS.importSpreadsheet, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, { properties: ["openFile"], filters: [{ name: "License spreadsheet", extensions: ["csv", "xlsx"] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    const workbook = XLSX.readFile(result.filePaths[0]); const firstSheet = workbook.SheetNames[0]; if (!firstSheet) throw new Error("The spreadsheet has no worksheets.");
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[firstSheet]!); let imported = 0; let skipped = 0; const errors: string[] = [];
    for (let index = 0; index < rows.length; index += 1) { try { if (await store.importLicense(parseImportRow(rows[index]!))) imported += 1; else skipped += 1; } catch (error) { errors.push(`Row ${index + 2}: ${error instanceof Error ? error.message : "Invalid record."}`); } }
    return { imported, skipped, errors: errors.slice(0, 100) };
  });
  register(LICENSE_MANAGER_CHANNELS.printLicense, async (licenseId: string) => {
    const window = await createPrintWindow(await activationSheetHtml(store.getLicense(licenseId), store.getBranding()));
    await new Promise<void>((resolve, reject) => window.webContents.print({ silent: false, printBackground: true }, (success, reason) => { window.close(); if (success) resolve(); else reject(new Error(reason || "Printing was cancelled.")); }));
  });
  register(LICENSE_MANAGER_CHANNELS.exportLicensePdf, async (licenseId: string) => {
    const result = await dialog.showSaveDialog(mainWindow!, { defaultPath: `Activation-${store.getLicense(licenseId).deviceId}.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (result.canceled || !result.filePath) return null;
    const window = await createPrintWindow(await activationSheetHtml(store.getLicense(licenseId), store.getBranding())); const pdf = await window.webContents.printToPDF({ printBackground: true, pageSize: "A4" }); window.close(); await writeFile(result.filePath, pdf); return result.filePath;
  });
}

async function createWindow() {
  mainWindow = new BrowserWindow({ width: 1440, height: 900, minWidth: 1050, minHeight: 680, backgroundColor: "#f5f7fa", show: false, webPreferences: { preload: join(dirname(fileURLToPath(import.meta.url)), "../preload/preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  mainWindow.removeMenu();
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  await mainWindow.loadFile(join(app.getAppPath(), "dist", "index.html"));
}

app.whenReady().then(async () => { registerIpc(); await createWindow(); app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) void createWindow(); }); });
app.on("before-quit", () => store.lock());
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
