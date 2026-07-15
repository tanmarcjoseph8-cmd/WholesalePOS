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
