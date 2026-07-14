import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import type { InventoryListQuery } from "./inventory.schemas.js";

export const stockInclude = {
  product: { select: { id: true, sku: true, name: true, costPrice: true, minimumStock: true, inventoryUnit: true } },
  warehouse: { select: { id: true, name: true, code: true, storeId: true } }
} satisfies Prisma.InventoryStockInclude;

export type StockBalanceQuery = Pick<InventoryListQuery, "productId" | "warehouseId" | "search"> & {
  lowStockOnly?: boolean;
  storeId?: string;
};

export type StockBalanceRow = {
  id: string;
  productId: string;
  warehouseId: string;
  quantity: Prisma.Decimal | number;
  reservedQuantity: Prisma.Decimal | number;
  availableQuantity: Prisma.Decimal | number;
  product: {
    id: string;
    sku: string;
    name: string;
    costPrice: Prisma.Decimal | number;
    minimumStock: Prisma.Decimal | number;
    inventoryUnit: string;
  };
  warehouse: {
    id: string;
    name: string;
    code: string;
    storeId: string;
  };
};

export function toNumber(value: Prisma.Decimal | number) {
  return Number(value);
}

export async function assertProductAndWarehouse(productId: string, warehouseId: string) {
  const [product, warehouse] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, deletedAt: null }, select: { id: true, name: true } }),
    prisma.warehouse.findFirst({ where: { id: warehouseId, deletedAt: null }, select: { id: true, storeId: true } })
  ]);

  if (!product) {
    throw new AppError(404, "PRODUCT_NOT_FOUND", "Product was not found.");
  }

  if (!warehouse) {
    throw new AppError(404, "WAREHOUSE_NOT_FOUND", "Warehouse was not found.");
  }

  return { product, warehouse };
}
