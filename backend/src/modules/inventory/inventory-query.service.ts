import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { buildPaginatedResponse, getPagination } from "../../shared/pagination.js";
import type { InventoryListQuery } from "./inventory.schemas.js";
import { stockInclude, toNumber, type StockBalanceQuery, type StockBalanceRow } from "./inventory-stock.shared.js";

export async function listWarehouses() {
  return prisma.warehouse.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, code: true, storeId: true },
    orderBy: [{ code: "asc" }, { name: "asc" }]
  });
}

export async function listStockRows(query: StockBalanceQuery = {}) {
  const productWhere: Prisma.ProductWhereInput = {
    id: query.productId,
    deletedAt: null,
    status: "ACTIVE",
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search } },
            { sku: { contains: query.search } },
            { barcodes: { some: { value: { contains: query.search } } } }
          ]
        }
      : {})
  };
  const warehouseWhere: Prisma.WarehouseWhereInput = {
    id: query.warehouseId,
    storeId: query.storeId,
    deletedAt: null
  };

  const [products, warehouses] = await prisma.$transaction([
    prisma.product.findMany({
      where: productWhere,
      select: { id: true, sku: true, name: true, costPrice: true, minimumStock: true, inventoryUnit: true },
      orderBy: [{ name: "asc" }, { sku: "asc" }]
    }),
    prisma.warehouse.findMany({
      where: warehouseWhere,
      select: { id: true, name: true, code: true, storeId: true },
      orderBy: [{ code: "asc" }, { name: "asc" }]
    })
  ]);

  if (!products.length || !warehouses.length) {
    return [];
  }

  const stockRows = await prisma.inventoryStock.findMany({
    where: {
      productId: { in: products.map((product) => product.id) },
      warehouseId: { in: warehouses.map((warehouse) => warehouse.id) }
    },
    include: stockInclude
  });
  const stockByProductWarehouse = new Map(stockRows.map((row) => [`${row.productId}:${row.warehouseId}`, row]));
  const rows: StockBalanceRow[] = [];

  for (const product of products) {
    for (const warehouse of warehouses) {
      const existingStock = stockByProductWarehouse.get(`${product.id}:${warehouse.id}`);
      rows.push(
        existingStock ?? {
          id: `zero-${product.id}-${warehouse.id}`,
          productId: product.id,
          warehouseId: warehouse.id,
          quantity: 0,
          product,
          warehouse
        }
      );
    }
  }

  const visibleRows = query.lowStockOnly
    ? rows.filter((row) => toNumber(row.quantity) <= toNumber(row.product.minimumStock))
    : rows;

  return visibleRows.sort((left, right) => {
    const productOrder = left.product.name.localeCompare(right.product.name);
    return productOrder || left.warehouse.code.localeCompare(right.warehouse.code);
  });
}

export async function listStock(query: InventoryListQuery) {
  const { page, pageSize, skip, take } = getPagination(query);
  const rows = await listStockRows(query);

  return buildPaginatedResponse(rows.slice(skip, skip + take), rows.length, page, pageSize);
}
