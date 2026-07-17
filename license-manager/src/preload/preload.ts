import { contextBridge, ipcRenderer } from "electron";
import type { LicenseManagerApi } from "../shared/contracts.js";
import { LICENSE_MANAGER_CHANNELS as channels } from "../shared/contracts.js";

const api: LicenseManagerApi & { onAutoLocked(listener: () => void): () => void } = {
  status: () => ipcRenderer.invoke(channels.status),
  setup: (input) => ipcRenderer.invoke(channels.setup, input),
  unlock: (password) => ipcRenderer.invoke(channels.unlock, password),
  lock: () => ipcRenderer.invoke(channels.lock),
  touch: () => ipcRenderer.invoke(channels.touch),
  snapshot: () => ipcRenderer.invoke(channels.snapshot),
  createLicense: (input) => ipcRenderer.invoke(channels.createLicense, input),
  reissueLicense: (licenseId, notes) => ipcRenderer.invoke(channels.reissueLicense, licenseId, notes),
  replaceDevice: (input) => ipcRenderer.invoke(channels.replaceDevice, input),
  setLicenseStatus: (input) => ipcRenderer.invoke(channels.setLicenseStatus, input),
  saveCustomer: (input) => ipcRenderer.invoke(channels.saveCustomer, input),
  saveBranding: (input) => ipcRenderer.invoke(channels.saveBranding, input),
  savePreferences: (input) => ipcRenderer.invoke(channels.savePreferences, input),
  addProduct: (input) => ipcRenderer.invoke(channels.addProduct, input),
  changePassword: (input) => ipcRenderer.invoke(channels.changePassword, input),
  manualBackup: () => ipcRenderer.invoke(channels.manualBackup),
  restoreBackup: (password) => ipcRenderer.invoke(channels.restoreBackup, password),
  exportCsv: () => ipcRenderer.invoke(channels.exportCsv),
  exportExcel: () => ipcRenderer.invoke(channels.exportExcel),
  importSpreadsheet: () => ipcRenderer.invoke(channels.importSpreadsheet),
  printLicense: (licenseId) => ipcRenderer.invoke(channels.printLicense, licenseId),
  exportLicensePdf: (licenseId) => ipcRenderer.invoke(channels.exportLicensePdf, licenseId),
  onAutoLocked: (listener) => { const handler = () => listener(); ipcRenderer.on("license-manager:auto-locked", handler); return () => ipcRenderer.removeListener("license-manager:auto-locked", handler); }
};

contextBridge.exposeInMainWorld("licenseManager", api);
