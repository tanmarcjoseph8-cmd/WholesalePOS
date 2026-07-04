import type { Prisma } from "@prisma/client";
import crypto from "node:crypto";
import { prisma } from "../../config/prisma.js";
import { publishRealtimeEvent } from "../../realtime/bus.js";
import { realtimeEvents } from "../../realtime/events.js";
import { AppError } from "../../shared/app-error.js";
import { buildPaginatedResponse, getPagination } from "../../shared/pagination.js";
import type { Actor } from "../auth/actor.js";
import type { ProductCreateInput, ProductListQuery, ProductUpdateInput } from "./product.schemas.js";
import { findPriceChanges, type PriceFields } from "./product-pricing.js";

const productInclude = {
  barcodes: true,
  category: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } }
} satisfies Prisma.ProductInclude;

function normalizeBarcodes(barcodes: ProductCreateInput["barcodes"]) {
  const seen = new Set<string>();
  const uniqueBarcodes = barcodes.map((barcode) => ({ ...barcode, value: barcode.value.trim() })).filter((barcode) => {
    const normalized = barcode.value.toLowerCase();
    if (seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });

  if (uniqueBarcodes.length > 0 && !uniqueBarcodes.some((barcode) => barcode.isPrimary)) {
    const [firstBarcode] = uniqueBarcodes;
    if (firstBarcode) {
      uniqueBarcodes[0] = { ...firstBarcode, isPrimary: true };
    }
  }

  return uniqueBarcodes;
}

function resolveSku(input: ProductCreateInput, barcodes: ReturnType<typeof normalizeBarcodes>) {
  if (input.sku?.trim()) {
    return input.sku.trim();
  }

  const primaryBarcode = barcodes.find((barcode) => barcode.isPrimary) ?? barcodes[0];
  if (primaryBarcode) {
    return primaryBarcode.value;
  }

  return `AUTO-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
}

function toPriceFields(product: {
  costPrice: Prisma.Decimal | number;
  retailPrice: Prisma.Decimal | number;
  wholesalePrice: Prisma.Decimal | number;
  vipPrice: Prisma.Decimal | number;
}): PriceFields {
  return {
    costPrice: Number(product.costPrice),
    retailPrice: Number(product.retailPrice),
    wholesalePrice: Number(product.wholesalePrice),
    vipPrice: Number(product.vipPrice)
  };
}

async function assertRelations(input: { categoryId?: string | null; supplierId?: string | null }) {
  if (input.categoryId) {
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, deletedAt: null }, select: { id: true } });
    if (!category) {
      throw new AppError(400, "CATEGORY_NOT_FOUND", "The selected category does not exist.");
    }
  }

  if (input.supplierId) {
    const supplier = await prisma.supplier.findFirst({ where: { id: input.supplierId, deletedAt: null }, select: { id: true } });
    if (!supplier) {
      throw new AppError(400, "SUPPLIER_NOT_FOUND", "The selected supplier does not exist.");
    }
  }
}

export async function listProducts(query: ProductListQuery) {
  const { page, pageSize, skip, take } = getPagination(query);
  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    status: query.status,
    categoryId: query.categoryId,
    supplierId: query.supplierId,
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search } },
            { sku: { contains: query.search } },
            { brand: { contains: query.search } },
            { barcodes: { some: { value: { contains: query.search } } } }
          ]
        }
      : {})
  };

  const [items, total] = await prisma.$transaction([
    prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      skip,
      take
    }),
    prisma.product.count({ where })
  ]);

  return buildPaginatedResponse(items, total, page, pageSize);
}

export async function getProduct(productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    include: {
      ...productInclude,
      stocks: {
        include: { warehouse: { select: { id: true, name: true, code: true } } }
      },
      priceHistory: {
        orderBy: { changedAt: "desc" },
        take: 20
      }
    }
  });

  if (!product) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Product was not found.");
  }

  return product;
}

export async function createProduct(input: ProductCreateInput, actor: Actor) {
  await assertRelations(input);
  const barcodes = normalizeBarcodes(input.barcodes);
  const sku = resolveSku(input, barcodes);

  const product = await prisma.$transaction(async (transaction) => {
    const created = await transaction.product.create({
      data: {
        ...input,
        sku,
        barcodes: {
          create: barcodes
        }
      },
      include: productInclude
    });

    await transaction.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "PRODUCT_CREATED",
        entityType: "Product",
        entityId: created.id,
        metadata: { sku: created.sku, name: created.name }
      }
    });

    return created;
  });

  publishRealtimeEvent(realtimeEvents.productCreated, {
    entityId: product.id,
    actorId: actor.userId,
    storeId: actor.storeId,
    occurredAt: new Date().toISOString()
  });

  return product;
}

export async function updateProduct(productId: string, input: ProductUpdateInput, actor: Actor) {
  await assertRelations(input);

  const existing = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    include: { barcodes: true }
  });

  if (!existing) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Product was not found.");
  }

  const priceChanges = findPriceChanges(toPriceFields(existing), input);
  const { barcodes, ...productData } = input;
  const normalizedBarcodes = barcodes ? normalizeBarcodes(barcodes) : undefined;

  const product = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.product.update({
      where: { id: productId },
      data: {
        ...productData,
        ...(normalizedBarcodes
          ? {
              barcodes: {
                deleteMany: {},
                create: normalizedBarcodes
              }
            }
          : {})
      },
      include: productInclude
    });

    if (priceChanges.length > 0) {
      await transaction.priceHistory.createMany({
        data: priceChanges.map((change) => ({
          productId,
          priceType: change.priceType,
          oldPrice: change.oldPrice,
          newPrice: change.newPrice,
          changedById: actor.userId
        }))
      });
    }

    await transaction.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "PRODUCT_UPDATED",
        entityType: "Product",
        entityId: productId,
        metadata: {
          changedFields: Object.keys(input),
          priceChanges
        }
      }
    });

    return updated;
  });

  publishRealtimeEvent(priceChanges.length > 0 ? realtimeEvents.priceChanged : realtimeEvents.productUpdated, {
    entityId: product.id,
    actorId: actor.userId,
    storeId: actor.storeId,
    occurredAt: new Date().toISOString()
  });

  return product;
}

export async function deleteProduct(productId: string, actor: Actor) {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { id: true, sku: true, name: true }
  });

  if (!product) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Product was not found.");
  }

  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { deletedAt: new Date(), status: "INACTIVE" }
    }),
    prisma.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "PRODUCT_DELETED",
        entityType: "Product",
        entityId: productId,
        metadata: { sku: product.sku, name: product.name }
      }
    })
  ]);

  publishRealtimeEvent(realtimeEvents.productUpdated, {
    entityId: productId,
    actorId: actor.userId,
    storeId: actor.storeId,
    occurredAt: new Date().toISOString()
  });

  return { success: true };
}
