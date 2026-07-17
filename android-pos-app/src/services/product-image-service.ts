import type { LocalDatabase } from "../data/database";
import { createId, nowIso, type LocalUser } from "../domain/models";
import { fileService, type FileService } from "../platform/file-service";
import { audit } from "./service-helpers";

type EncodedImage = { data: string; width: number; height: number; bytes: number };

function dataUrlPayload(value: string) {
  return value.slice(value.indexOf(",") + 1);
}

async function loadImage(bytes: Uint8Array, mimeType: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: mimeType }));
  try {
    const image = new Image();
    image.decoding = "async";
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("The selected image could not be decoded.")); image.src = url; });
    return image;
  } finally { URL.revokeObjectURL(url); }
}

function resize(image: HTMLImageElement, maxDimension: number, quality: number): EncodedImage {
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image processing is unavailable on this tablet.");
  context.drawImage(image, 0, 0, width, height);
  const data = dataUrlPayload(canvas.toDataURL("image/jpeg", quality));
  return { data, width, height, bytes: Math.ceil(data.length * 0.75) };
}

/** Owns compressed local product image files and their lightweight database references. */
export class ProductImageService {
  constructor(private readonly db: LocalDatabase, private readonly files: FileService = fileService) {}

  /** Selects, compresses, thumbnails, and atomically assigns a primary product image. */
  async pickAndSave(actor: LocalUser, productId: string) {
    if (!actor.permissions.includes("*") && !actor.permissions.includes("products.manage")) throw new Error("Product management permission is required.");
    const source = await this.files.pickFile(["image/jpeg", "image/png", "image/webp"]);
    if (source.bytes.length > 12 * 1024 * 1024) throw new Error("Product images must be 12 MB or smaller.");
    const image = await loadImage(source.bytes, source.mimeType);
    const full = resize(image, 1600, 0.82);
    const thumbnail = resize(image, 256, 0.76);
    const imageId = createId("image");
    const fullName = `${productId}/${imageId}.jpg`;
    const thumbnailName = `${productId}/${imageId}-thumb.jpg`;
    let fullUri = "";
    let thumbnailUri = "";
    try {
      fullUri = await this.files.writeProductImage(fullName, full.data);
      thumbnailUri = await this.files.writeProductImage(thumbnailName, thumbnail.data);
      const previous = await this.db.query<{ id: string }>("SELECT id FROM product_images WHERE product_id=? AND is_primary=1 AND deleted_at IS NULL", [productId]);
      const now = nowIso();
      await this.db.transaction(async () => {
        await this.db.run("UPDATE product_images SET is_primary=0, deleted_at=?, updated_at=? WHERE product_id=? AND is_primary=1 AND deleted_at IS NULL", [now, now, productId], false);
        await this.db.run("INSERT INTO product_images(id, product_id, file_path, thumbnail_path, mime_type, width, height, byte_size, is_primary, created_at, updated_at) VALUES (?, ?, ?, ?, 'image/jpeg', ?, ?, ?, 1, ?, ?)", [imageId, productId, fullUri, thumbnailUri, full.width, full.height, full.bytes, now, now], false);
        await audit(this.db, { actorId: actor.id, action: "PRODUCT_IMAGE_UPDATED", entityType: "Product", entityId: productId, metadata: { imageId, bytes: full.bytes, width: full.width, height: full.height } });
      });
      return { imageId, thumbnailUri, replaced: previous.length };
    } catch (error) {
      await Promise.allSettled([
        ...(fullUri ? [this.files.deleteProductImage(fullName)] : []),
        ...(thumbnailUri ? [this.files.deleteProductImage(thumbnailName)] : [])
      ]);
      throw error;
    }
  }
}
