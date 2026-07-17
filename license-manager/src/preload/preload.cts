import { contextBridge, ipcRenderer } from "electron";

const channels = {
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

const api = {
  status: () => ipcRenderer.invoke(channels.status),
  setup: (input: unknown) => ipcRenderer.invoke(channels.setup, input),
  unlock: (password: string) => ipcRenderer.invoke(channels.unlock, password),
  lock: () => ipcRenderer.invoke(channels.lock),
  touch: () => ipcRenderer.invoke(channels.touch),
  snapshot: () => ipcRenderer.invoke(channels.snapshot),
  createLicense: (input: unknown) => ipcRenderer.invoke(channels.createLicense, input),
  renewLicense: (input: unknown) => ipcRenderer.invoke(channels.renewLicense, input),
  reissueLicense: (licenseId: string, notes: string) => ipcRenderer.invoke(channels.reissueLicense, licenseId, notes),
  replaceDevice: (input: unknown) => ipcRenderer.invoke(channels.replaceDevice, input),
  setLicenseStatus: (input: unknown) => ipcRenderer.invoke(channels.setLicenseStatus, input),
  saveCustomer: (input: unknown) => ipcRenderer.invoke(channels.saveCustomer, input),
  saveBranding: (input: unknown) => ipcRenderer.invoke(channels.saveBranding, input),
  savePreferences: (input: unknown) => ipcRenderer.invoke(channels.savePreferences, input),
  addProduct: (input: unknown) => ipcRenderer.invoke(channels.addProduct, input),
  changePassword: (input: unknown) => ipcRenderer.invoke(channels.changePassword, input),
  manualBackup: () => ipcRenderer.invoke(channels.manualBackup),
  restoreBackup: (password: string) => ipcRenderer.invoke(channels.restoreBackup, password),
  exportCsv: () => ipcRenderer.invoke(channels.exportCsv),
  exportExcel: () => ipcRenderer.invoke(channels.exportExcel),
  importSpreadsheet: () => ipcRenderer.invoke(channels.importSpreadsheet),
  printLicense: (licenseId: string) => ipcRenderer.invoke(channels.printLicense, licenseId),
  exportLicensePdf: (licenseId: string) => ipcRenderer.invoke(channels.exportLicensePdf, licenseId),
  onAutoLocked: (listener: () => void) => {
    const handler = () => listener();
    ipcRenderer.on("license-manager:auto-locked", handler);
    return () => ipcRenderer.removeListener("license-manager:auto-locked", handler);
  }
};

contextBridge.exposeInMainWorld("licenseManager", api);
