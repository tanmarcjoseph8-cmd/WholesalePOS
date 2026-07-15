import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { FilePicker } from "@capawesome/capacitor-file-picker";

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

  async saveAndShare(input: { fileName: string; data: string; mimeType: string; base64?: boolean; dialogTitle: string }) {
    const result = await Filesystem.writeFile({
      path: `exports/${input.fileName}`,
      directory: Directory.Cache,
      data: input.data,
      encoding: input.base64 ? undefined : Encoding.UTF8,
      recursive: true
    });
    await Share.share({ title: input.fileName, dialogTitle: input.dialogTitle, files: [result.uri] });
    return result.uri;
  }
}

export const fileService = new FileService();

