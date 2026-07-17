import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { FilePicker } from "@capawesome/capacitor-file-picker";
import { Capacitor } from "@capacitor/core";

function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export class FileService {
  async pickFile(types: string[]) {
    const result = await FilePicker.pickFiles({ types, limit: 1, readData: true });
    const file = result.files[0];
    if (!file?.data) throw new Error("The selected file could not be read.");
    return { name: file.name, mimeType: file.mimeType, bytes: decodeBase64(file.data) };
  }

  async writeCacheFile(input: { fileName: string; data: string; base64?: boolean }) {
    const result = await Filesystem.writeFile({
      path: `exports/${input.fileName}`,
      directory: Directory.Cache,
      data: input.data,
      encoding: input.base64 ? undefined : Encoding.UTF8,
      recursive: true
    });
    return { uri: result.uri, webPath: Capacitor.convertFileSrc(result.uri) };
  }

  async writePersistentBackup(input: { fileName: string; data: string }) {
    const path = `WholesalePOS Backups/${input.fileName}`;
    const result = await Filesystem.writeFile({ path, directory: Directory.External, data: input.data, encoding: Encoding.UTF8, recursive: true });
    const verified = await Filesystem.stat({ path, directory: Directory.External });
    if (verified.type !== "file" || verified.size <= 0) throw new Error("The backup file could not be verified.");
    return { uri: result.uri, path, bytes: verified.size };
  }

  /** Writes an optimized product image to private app storage and returns its stable URI. */
  async writeProductImage(path: string, base64Data: string) {
    const result = await Filesystem.writeFile({ path: `product-images/${path}`, directory: Directory.Data, data: base64Data, recursive: true });
    return result.uri;
  }

  /** Removes one app-owned product image without touching any unrelated file. */
  async deleteProductImage(path: string) {
    try { await Filesystem.deleteFile({ path: `product-images/${path}`, directory: Directory.Data }); }
    catch { /* A missing optional image already satisfies cleanup. */ }
  }

  /** Converts a stored native file URI into a WebView-safe source URL. */
  localAssetUrl(uri: string | null) {
    return uri ? Capacitor.convertFileSrc(uri) : null;
  }

  async clearGeneratedLocalFiles() {
    const generated = [
      { path: "exports", directory: Directory.Cache },
      { path: "reports", directory: Directory.Cache },
      { path: "product-images", directory: Directory.Data },
      { path: "business-assets", directory: Directory.Data }
    ];
    for (const entry of generated) {
      try {
        const info = await Filesystem.stat(entry);
        if (info.type === "directory") await Filesystem.rmdir({ ...entry, recursive: true });
        else await Filesystem.deleteFile(entry);
      } catch {
        // A missing optional directory already satisfies the reset requirement.
      }
    }
  }

  async shareFile(input: { fileName: string; uri: string; dialogTitle: string }) {
    await Share.share({ title: input.fileName, dialogTitle: input.dialogTitle, files: [input.uri] });
  }

  async saveAndShare(input: { fileName: string; data: string; mimeType: string; base64?: boolean; dialogTitle: string }) {
    const result = await this.writeCacheFile(input);
    await this.shareFile({ fileName: input.fileName, uri: result.uri, dialogTitle: input.dialogTitle });
    return result.uri;
  }
}

export const fileService = new FileService();
