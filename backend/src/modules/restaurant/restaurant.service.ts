import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { publishRealtimeEvent } from "../../realtime/bus.js";
import { realtimeEvents } from "../../realtime/events.js";
import { AppError } from "../../shared/app-error.js";
import { buildPaginatedResponse, getPagination } from "../../shared/pagination.js";
import type { Actor } from "../auth/actor.js";
import { calculateVariableSaleLine, type UnitCode } from "../inventory/unit-conversion.js";
import { nextSequenceNumber } from "../sales/numbering.service.js";
import { completeHeldSale } from "../sales/sale.service.js";
import { releaseOrderReservations, reservationOrderStatuses, syncOrderReservations } from "./order-reservation.service.js";
import type {
  RestaurantOrderCancelInput,
  RestaurantOrderCheckoutInput,
  RestaurantOrderCreateInput,
  RestaurantOrderListQuery,
  RestaurantOrderMergeInput,
  RestaurantOrderSplitInput,
  RestaurantOrderTableAssignmentInput,
  RestaurantOrderUndoInput,
  RestaurantOrderUpdateInput,
  RestaurantTableCreateInput,
  RestaurantTableListQuery,
  RestaurantTableUpdateInput
} from "./restaurant.schemas.js";

const closedOrderStatuses = ["COMPLETED", "CANCELLED"];
const lockDurationMs = 2 * 60 * 1000;

const orderTransitions: Record<string, string[]> = {
  DRAFT: ["OPEN", "CONFIRMED", "PREPARING", "CANCELLED"],
  OPEN: ["CONFIRMED", "PREPARING", "READY", "SERVED", "CANCELLED"],
  CONFIRMED: ["OPEN", "PREPARING", "READY", "SERVED", "CANCELLED"],
  PREPARING: ["READY", "SERVED", "CANCELLED"],
  READY: ["SERVED", "CANCELLED"],
  SERVED: ["CANCELLED"],
  CANCELLED: ["OPEN"]
};

const orderStatusToTableStatus: Record<string, string> = {
  DRAFT: "AWAITING_ORDER",
  OPEN: "OCCUPIED",
  CONFIRMED: "OCCUPIED",
  PREPARING: "PREPARING",
  READY: "PREPARING",
  SERVED: "SERVED"
};

const orderPrefix: Record<string, string> = {
  DINE_IN: "DINE",
  WALK_IN: "WALK",
  COUNTER: "WALK",
  TAKEOUT: "TAKE",
  PICKUP: "TAKE",
  DELIVERY: "DEL",
  OTHER: "ORD"
};

function requireStoreId(actor: Actor) {
  if (!actor.storeId) {
    throw new AppError(400, "STORE_REQUIRED", "Restaurant operations require a store.");
  }
  return actor.storeId;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function toNumber(value: Prisma.Decimal | number) {
  return Number(value);
}

function lockExpiry() {
  return new Date(Date.now() + lockDurationMs);
}

async function getRestaurantConfiguration(storeId: string) {
  const rows = await prisma.setting.findMany({ where: { storeId, key: { in: ["businessMode", "restaurant"] } } });
  const saved = Object.fromEntries(rows.map((row) => [row.key, row.value])) as Record<string, { [key: string]: unknown } | undefined>;
  const mode = typeof saved.businessMode?.mode === "string" ? saved.businessMode.mode : "RETAIL";
  if (mode !== "RESTAURANT" && mode !== "HYBRID") {
    throw new AppError(409, "RESTAURANT_MODE_DISABLED", "Enable Restaurant or Hybrid mode in Settings first.");
  }

  return {
    enableTables: saved.restaurant?.enableTables !== false,
    allowWalkInOrders: saved.restaurant?.allowWalkInOrders !== false,
    enableDelivery: saved.restaurant?.enableDelivery === true,
    enableTakeout: saved.restaurant?.enableTakeout !== false,
    customOrderTypes: Array.isArray(saved.restaurant?.customOrderTypes) ? saved.restaurant.customOrderTypes.filter((value): value is string => typeof value === "string") : []
  };
}

async function requireRestaurantMode(actor: Actor) {
  const storeId = requireStoreId(actor);
  return { storeId, configuration: await getRestaurantConfiguration(storeId) };
}

async function requireActorPermission(userId: string, permission: string) {
  const count = await prisma.rolePermission.count({
    where: { permission: { key: permission }, role: { users: { some: { id: userId, isActive: true, deletedAt: null } } } }
  });
  if (!count) {
    throw new AppError(403, "PERMISSION_REQUIRED", `The ${permission} permission is required.`);
  }
}

const tableInclude = {
  assignedStaff: { select: { id: true, name: true } },
  activeOrder: { select: { id: true, orderNumber: true, orderType: true, status: true, guestCount: true, version: true, updatedAt: true } }
} satisfies Prisma.RestaurantTableInclude;

const orderInclude = {
  cashier: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, phone: true } },
  primaryTable: { select: { id: true, number: true, section: true } },
  assignedTables: { where: { deletedAt: null }, select: { id: true, number: true, section: true, status: true }, orderBy: { number: "asc" } },
  lockedBy: { select: { id: true, name: true } },
  completedSale: {
    select: {
      id: true,
      receiptNumber: true,
      status: true,
      items: { select: { id: true, productId: true, soldQuantity: true, soldUnit: true } }
    }
  },
  reservations: {
    where: { status: "ACTIVE" },
    select: { id: true, productId: true, warehouseId: true, quantity: true, status: true }
  },
  items: {
    where: { deletedAt: null },
    include: { product: { select: { id: true, sku: true, name: true, variant: true, inventoryUnit: true, sellingUnit: true, taxRate: true } } },
    orderBy: { createdAt: "asc" }
  }
} satisfies Prisma.HeldSaleInclude;

function publishRestaurantChange(entityId: string, actor: Actor) {
  publishRealtimeEvent(realtimeEvents.restaurantChanged, {
    entityId,
    actorId: actor.userId,
    storeId: actor.storeId,
    occurredAt: new Date().toISOString()
  });
}

export async function listRestaurantTables(query: RestaurantTableListQuery, actor: Actor) {
  const { storeId, configuration } = await requireRestaurantMode(actor);
  if (!configuration.enableTables) return [];

  return prisma.restaurantTable.findMany({
    where: {
      storeId,
      deletedAt: query.includeInactive ? undefined : null,
      isActive: query.includeInactive ? undefined : true,
      section: query.section
    },
    include: tableInclude,
    orderBy: [{ section: "asc" }, { number: "asc" }]
  });
}

export async function createRestaurantTable(input: RestaurantTableCreateInput, actor: Actor) {
  const { storeId, configuration } = await requireRestaurantMode(actor);
  if (!configuration.enableTables) {
    throw new AppError(409, "TABLES_DISABLED", "Table management is disabled in Restaurant settings.");
  }

  const table = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.restaurantTable.findUnique({ where: { storeId_number: { storeId, number: input.number } } });
    if (existing) {
      throw new AppError(409, "TABLE_NUMBER_EXISTS", "A table with this number already exists.");
    }
    const created = await transaction.restaurantTable.create({
      data: { storeId, number: input.number, section: input.section, capacity: input.capacity, status: input.status, notes: input.notes },
      include: tableInclude
    });
    await transaction.auditLog.create({
      data: { actorId: actor.userId, action: "RESTAURANT_TABLE_CREATED", entityType: "RestaurantTable", entityId: created.id, metadata: { number: created.number, section: created.section } }
    });
    return created;
  });
  publishRestaurantChange(table.id, actor);
  return table;
}

export async function updateRestaurantTable(id: string, input: RestaurantTableUpdateInput, actor: Actor) {
  const { storeId } = await requireRestaurantMode(actor);
  const table = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.restaurantTable.findFirst({ where: { id, storeId, deletedAt: null } });
    if (!existing) throw new AppError(404, "TABLE_NOT_FOUND", "Restaurant table was not found.");
    if (existing.activeOrderId && (input.isActive === false || (input.status && input.status !== existing.status))) {
      throw new AppError(409, "TABLE_HAS_ACTIVE_ORDER", "Move or complete the active order before changing this table.");
    }
    const updated = await transaction.restaurantTable.update({ where: { id }, data: input, include: tableInclude });
    await transaction.auditLog.create({
      data: { actorId: actor.userId, action: "RESTAURANT_TABLE_UPDATED", entityType: "RestaurantTable", entityId: id, metadata: input }
    });
    return updated;
  });
  publishRestaurantChange(id, actor);
  return table;
}

export async function disableRestaurantTable(id: string, actor: Actor) {
  const { storeId } = await requireRestaurantMode(actor);
  const table = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.restaurantTable.findFirst({ where: { id, storeId, deletedAt: null } });
    if (!existing) throw new AppError(404, "TABLE_NOT_FOUND", "Restaurant table was not found.");
    if (existing.activeOrderId) throw new AppError(409, "TABLE_HAS_ACTIVE_ORDER", "Move or complete the active order before disabling this table.");
    const disabled = await transaction.restaurantTable.update({
      where: { id },
      data: { isActive: false, status: "AVAILABLE", deletedAt: new Date() },
      include: tableInclude
    });
    await transaction.auditLog.create({
      data: { actorId: actor.userId, action: "RESTAURANT_TABLE_DISABLED", entityType: "RestaurantTable", entityId: id, metadata: { number: existing.number } }
    });
    return disabled;
  });
  publishRestaurantChange(id, actor);
  return table;
}

export async function restoreRestaurantTable(id: string, actor: Actor) {
  const { storeId } = await requireRestaurantMode(actor);
  const table = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.restaurantTable.findFirst({ where: { id, storeId, isActive: false } });
    if (!existing) throw new AppError(404, "INACTIVE_TABLE_NOT_FOUND", "Inactive restaurant table was not found.");
    const restored = await transaction.restaurantTable.update({
      where: { id },
      data: { isActive: true, deletedAt: null, status: "AVAILABLE", activeOrderId: null, assignedStaffId: null, guestCount: 0, occupiedAt: null },
      include: tableInclude
    });
    await transaction.auditLog.create({
      data: { actorId: actor.userId, action: "RESTAURANT_TABLE_RESTORED", entityType: "RestaurantTable", entityId: id, metadata: { number: existing.number } }
    });
    return restored;
  });
  publishRestaurantChange(id, actor);
  return table;
}

async function prepareOrderItems(transaction: Prisma.TransactionClient, items: RestaurantOrderCreateInput["items"]) {
  if (!items.length) return [];
  const productIds = [...new Set(items.map((item) => item.productId))];
  const products = await transaction.product.findMany({
    where: { id: { in: productIds }, deletedAt: null, status: "ACTIVE" },
    select: { id: true, inventoryUnit: true, sellingUnit: true, packageSize: true, retailPrice: true, wholesalePrice: true, wholesaleThreshold: true, taxRate: true }
  });
  const productById = new Map(products.map((product) => [product.id, product]));
  if (productById.size !== productIds.length) {
      throw new AppError(404, "PRODUCT_NOT_FOUND", "One or more active POS products were not found.");
  }

  return items.map((item) => {
    const product = productById.get(item.productId) as (typeof products)[number];
    const soldUnit = (item.soldUnit ?? product.sellingUnit) as UnitCode;
    const firstPass = calculateVariableSaleLine({
      packagePrice: toNumber(product.retailPrice),
      packageSize: toNumber(product.packageSize),
      soldQuantity: item.quantity,
      soldUnit,
      inventoryUnit: product.inventoryUnit as UnitCode
    });
    const packagePrice =
      toNumber(product.wholesaleThreshold) > 0 && firstPass.baseQuantity >= toNumber(product.wholesaleThreshold)
        ? toNumber(product.wholesalePrice)
        : toNumber(product.retailPrice);
    const line = calculateVariableSaleLine({
      packagePrice,
      packageSize: toNumber(product.packageSize),
      soldQuantity: item.quantity,
      soldUnit,
      inventoryUnit: product.inventoryUnit as UnitCode
    });
    const unitPrice = item.unitPrice ?? line.unitPrice;
    const gross = roundMoney(unitPrice * line.baseQuantity);
    const discount = Math.min(item.discount, gross);
    const taxable = gross - discount;
    const taxAmount = roundMoney(taxable * toNumber(product.taxRate));
    return {
      productId: item.productId,
      warehouseId: item.warehouseId,
      quantity: item.quantity,
      soldUnit,
      baseQuantity: line.baseQuantity,
      unitPrice,
      discount,
      taxAmount,
      lineTotal: roundMoney(taxable + taxAmount),
      note: item.note
    };
  });
}

function orderTotals(items: Array<{ unitPrice: number; baseQuantity: number; discount: number; taxAmount: number; lineTotal: number }>, serviceCharge: number, tip: number) {
  return {
    subtotal: roundMoney(items.reduce((sum, item) => sum + item.unitPrice * item.baseQuantity, 0)),
    discountTotal: roundMoney(items.reduce((sum, item) => sum + item.discount, 0)),
    taxTotal: roundMoney(items.reduce((sum, item) => sum + item.taxAmount, 0)),
    grandTotal: roundMoney(items.reduce((sum, item) => sum + item.lineTotal, 0) + serviceCharge + tip)
  };
}

async function validateAssignableTables(transaction: Prisma.TransactionClient, storeId: string, tableIds: string[], orderId?: string) {
  const uniqueTableIds = [...new Set(tableIds)];
  const tables = await transaction.restaurantTable.findMany({ where: { id: { in: uniqueTableIds }, storeId, isActive: true, deletedAt: null } });
  if (tables.length !== uniqueTableIds.length) throw new AppError(404, "TABLE_NOT_FOUND", "One or more selected tables were not found.");
  if (tables.some((table) => table.activeOrderId && table.activeOrderId !== orderId)) {
    throw new AppError(409, "TABLE_ALREADY_ASSIGNED", "One or more selected tables already have an active order.");
  }
  return uniqueTableIds;
}

export async function createRestaurantOrder(input: RestaurantOrderCreateInput, actor: Actor) {
  const { storeId, configuration } = await requireRestaurantMode(actor);
  if (["WALK_IN", "COUNTER"].includes(input.orderType) && !configuration.allowWalkInOrders) throw new AppError(409, "WALK_IN_DISABLED", "Walk-in orders are disabled.");
  if (["TAKEOUT", "PICKUP"].includes(input.orderType) && !configuration.enableTakeout) throw new AppError(409, "TAKEOUT_DISABLED", "Takeout orders are disabled.");
  if (input.orderType === "DELIVERY" && !configuration.enableDelivery) throw new AppError(409, "DELIVERY_DISABLED", "Delivery orders are disabled.");
  if (input.orderType === "DINE_IN" && !configuration.enableTables) throw new AppError(409, "TABLES_DISABLED", "Table service is disabled.");
  if (input.orderType === "OTHER" && (!input.customOrderType || !configuration.customOrderTypes.includes(input.customOrderType))) throw new AppError(409, "CUSTOM_ORDER_TYPE_DISABLED", "Choose a configured custom order type.");
  if (input.items.some((item) => item.discount > 0)) await requireActorPermission(actor.userId, "orders.discount");

  const order = await prisma.$transaction(async (transaction) => {
    const requestedTables = input.orderType === "DINE_IN" ? [...input.tableIds, ...(input.primaryTableId ? [input.primaryTableId] : [])] : [];
    const tableIds = await validateAssignableTables(transaction, storeId, requestedTables);
    if (input.orderType === "DINE_IN" && (!input.primaryTableId || !tableIds.includes(input.primaryTableId))) {
      throw new AppError(400, "PRIMARY_TABLE_REQUIRED", "Dine-in orders require a primary table.");
    }
    const items = await prepareOrderItems(transaction, input.items);
    const totals = orderTotals(items, input.serviceCharge, input.tip);
    const prefix = orderPrefix[input.orderType];
    if (!prefix) throw new AppError(400, "ORDER_TYPE_INVALID", "Restaurant order type is invalid.");
    const orderNumber = await nextSequenceNumber(transaction, storeId, prefix);
    const created = await transaction.heldSale.create({
      data: {
        storeId,
        cashierId: actor.userId,
        customerId: input.customerId,
        primaryTableId: input.orderType === "DINE_IN" ? input.primaryTableId : null,
        lockedByUserId: actor.userId,
        lockExpiresAt: lockExpiry(),
        orderNumber,
        orderType: input.orderType,
        customOrderType: input.orderType === "OTHER" ? input.customOrderType : null,
        status: input.items.length ? "OPEN" : "DRAFT",
        label: input.customerName || orderNumber,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        queueNumber: input.queueNumber,
        guestCount: input.guestCount,
        note: input.note,
        serviceCharge: input.serviceCharge,
        tip: input.tip,
        ...totals,
        items: { create: items }
      },
      include: orderInclude
    });
    if (tableIds.length) {
      await transaction.restaurantTable.updateMany({
        where: { id: { in: tableIds } },
        data: { activeOrderId: created.id, status: orderStatusToTableStatus[created.status], guestCount: input.guestCount, assignedStaffId: actor.userId, occupiedAt: new Date() }
      });
    }
    await transaction.auditLog.create({
      data: { actorId: actor.userId, action: "RESTAURANT_ORDER_CREATED", entityType: "HeldSale", entityId: created.id, metadata: { orderNumber, orderType: input.orderType, tableIds } }
    });
    return transaction.heldSale.findUniqueOrThrow({ where: { id: created.id }, include: orderInclude });
  });
  publishRestaurantChange(order.id, actor);
  return order;
}

export async function listRestaurantOrders(query: RestaurantOrderListQuery, actor: Actor) {
  const { storeId } = await requireRestaurantMode(actor);
  const { page, pageSize, skip, take } = getPagination(query);
  const where: Prisma.HeldSaleWhereInput = {
    storeId,
    deletedAt: null,
    status: query.status ?? (query.includeClosed ? undefined : { notIn: closedOrderStatuses }),
    orderType: query.orderType,
    OR: query.search
      ? [
          { orderNumber: { contains: query.search } },
          { customerName: { contains: query.search } },
          { customerPhone: { contains: query.search } },
          { queueNumber: { contains: query.search } }
        ]
      : undefined
  };
  const [items, total] = await prisma.$transaction([
    prisma.heldSale.findMany({ where, include: orderInclude, orderBy: { updatedAt: "desc" }, skip, take }),
    prisma.heldSale.count({ where })
  ]);
  return buildPaginatedResponse(items, total, page, pageSize);
}

export async function getRestaurantOrder(id: string, actor: Actor) {
  const { storeId } = await requireRestaurantMode(actor);
  const order = await prisma.heldSale.findFirst({ where: { id, storeId, deletedAt: null }, include: orderInclude });
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Restaurant order was not found.");
  return order;
}

export async function acquireRestaurantOrderLock(id: string, expectedVersion: number | undefined, actor: Actor) {
  const { storeId } = await requireRestaurantMode(actor);
  const now = new Date();
  const result = await prisma.heldSale.updateMany({
    where: {
      id,
      storeId,
      deletedAt: null,
      version: expectedVersion,
      status: { notIn: closedOrderStatuses },
      OR: [{ lockedByUserId: null }, { lockedByUserId: actor.userId }, { lockExpiresAt: { lte: now } }]
    },
    data: { lockedByUserId: actor.userId, lockExpiresAt: lockExpiry() }
  });
  if (!result.count) {
    const order = await prisma.heldSale.findFirst({ where: { id, storeId, deletedAt: null }, include: { lockedBy: { select: { name: true } } } });
    if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Restaurant order was not found.");
    if (expectedVersion && order.version !== expectedVersion) throw new AppError(409, "ORDER_VERSION_CONFLICT", "This order changed. Reload it before editing.");
    throw new AppError(409, "ORDER_LOCKED", `${order.lockedBy?.name ?? "Another employee"} is editing this order.`);
  }
  return getRestaurantOrder(id, actor);
}

export async function releaseRestaurantOrderLock(id: string, actor: Actor) {
  const { storeId } = await requireRestaurantMode(actor);
  await prisma.heldSale.updateMany({ where: { id, storeId, lockedByUserId: actor.userId }, data: { lockedByUserId: null, lockExpiresAt: null } });
  return { released: true };
}

async function requireEditableOrder(transaction: Prisma.TransactionClient, id: string, storeId: string, expectedVersion: number, actor: Actor) {
  const order = await transaction.heldSale.findFirst({ where: { id, storeId, deletedAt: null } });
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Restaurant order was not found.");
  if (order.version !== expectedVersion) throw new AppError(409, "ORDER_VERSION_CONFLICT", "This order changed. Reload it before editing.");
  if (closedOrderStatuses.includes(order.status)) throw new AppError(409, "ORDER_NOT_EDITABLE", "Closed orders cannot be edited.");
  if (order.lockedByUserId && order.lockedByUserId !== actor.userId && order.lockExpiresAt && order.lockExpiresAt > new Date()) {
    throw new AppError(409, "ORDER_LOCKED", "Another employee is editing this order.");
  }
  return order;
}

export async function updateRestaurantOrder(id: string, input: RestaurantOrderUpdateInput, actor: Actor) {
  const { storeId } = await requireRestaurantMode(actor);
  if (input.items?.some((item) => item.discount > 0)) await requireActorPermission(actor.userId, "orders.discount");
  const order = await prisma.$transaction(async (transaction) => {
    const existing = await requireEditableOrder(transaction, id, storeId, input.expectedVersion, actor);
    if (input.status && input.status !== existing.status && !(orderTransitions[existing.status] ?? []).includes(input.status)) {
      throw new AppError(409, "INVALID_ORDER_TRANSITION", `Order cannot move from ${existing.status} to ${input.status}.`);
    }
    const previousItems = await transaction.heldSaleItem.findMany({ where: { heldSaleId: id, deletedAt: null } });
    const preparedItems = input.items ? await prepareOrderItems(transaction, input.items) : null;
    if (preparedItems) {
      await transaction.heldSaleItem.updateMany({ where: { heldSaleId: id, deletedAt: null }, data: { deletedAt: new Date() } });
      if (preparedItems.length) await transaction.heldSaleItem.createMany({ data: preparedItems.map((item) => ({ heldSaleId: id, ...item })) });
    }
    const serviceCharge = input.serviceCharge ?? toNumber(existing.serviceCharge);
    const tip = input.tip ?? toNumber(existing.tip);
    const activeItems = (await transaction.heldSaleItem.findMany({ where: { heldSaleId: id, deletedAt: null } })).map((item) => ({
      ...item,
      unitPrice: toNumber(item.unitPrice),
      baseQuantity: toNumber(item.baseQuantity),
      discount: toNumber(item.discount),
      taxAmount: toNumber(item.taxAmount),
      lineTotal: toNumber(item.lineTotal)
    }));
    const totals = orderTotals(activeItems, serviceCharge, tip);
    const nextStatus = input.status ?? (preparedItems?.length && existing.status === "DRAFT" ? "OPEN" : existing.status);
    const updated = await transaction.heldSale.updateMany({
      where: { id, version: input.expectedVersion },
      data: {
        customerId: input.customerId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        queueNumber: input.queueNumber,
        guestCount: input.guestCount,
        note: input.note,
        serviceCharge,
        tip,
        status: nextStatus,
        ...totals,
        lockedByUserId: actor.userId,
        lockExpiresAt: lockExpiry(),
        version: { increment: 1 }
      }
    });
    if (!updated.count) throw new AppError(409, "ORDER_VERSION_CONFLICT", "This order changed. Reload it before editing.");
    await syncOrderReservations(
      transaction,
      { id, storeId, status: nextStatus, orderNumber: existing.orderNumber },
      activeItems,
      actor.userId
    );
    await transaction.restaurantTable.updateMany({
      where: { activeOrderId: id },
      data: { status: orderStatusToTableStatus[nextStatus] ?? "OCCUPIED", guestCount: input.guestCount ?? existing.guestCount }
    });
    await transaction.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "RESTAURANT_ORDER_UPDATED",
        entityType: "HeldSale",
        entityId: id,
        metadata: {
          version: input.expectedVersion + 1,
          previousStatus: existing.status,
          status: nextStatus,
          previousItems: previousItems.map((item) => ({ id: item.id, productId: item.productId, warehouseId: item.warehouseId, quantity: toNumber(item.quantity), soldUnit: item.soldUnit, baseQuantity: toNumber(item.baseQuantity), unitPrice: toNumber(item.unitPrice), discount: toNumber(item.discount), taxAmount: toNumber(item.taxAmount), lineTotal: toNumber(item.lineTotal), note: item.note })),
          items: activeItems.map((item) => ({ id: item.id, productId: item.productId, warehouseId: item.warehouseId, quantity: toNumber(item.quantity), soldUnit: item.soldUnit, baseQuantity: toNumber(item.baseQuantity), unitPrice: toNumber(item.unitPrice), discount: toNumber(item.discount), taxAmount: toNumber(item.taxAmount), lineTotal: toNumber(item.lineTotal), note: item.note }))
        }
      }
    });
    return transaction.heldSale.findUniqueOrThrow({ where: { id }, include: orderInclude });
  });
  publishRestaurantChange(id, actor);
  return order;
}

export async function assignRestaurantOrderTables(id: string, input: RestaurantOrderTableAssignmentInput, actor: Actor) {
  const { storeId } = await requireRestaurantMode(actor);
  const order = await prisma.$transaction(async (transaction) => {
    const existing = await requireEditableOrder(transaction, id, storeId, input.expectedVersion, actor);
    const tableIds = await validateAssignableTables(transaction, storeId, [...input.tableIds, input.primaryTableId], id);
    if (!tableIds.includes(input.primaryTableId)) throw new AppError(400, "PRIMARY_TABLE_REQUIRED", "Primary table must be in the assigned table list.");
    await transaction.restaurantTable.updateMany({
      where: { activeOrderId: id, id: { notIn: tableIds } },
      data: { activeOrderId: null, assignedStaffId: null, status: "AVAILABLE", guestCount: 0, occupiedAt: null }
    });
    await transaction.restaurantTable.updateMany({
      where: { id: { in: tableIds } },
      data: { activeOrderId: id, assignedStaffId: actor.userId, status: orderStatusToTableStatus[existing.status] ?? "OCCUPIED", guestCount: existing.guestCount, occupiedAt: existing.createdAt }
    });
    await transaction.heldSale.update({
      where: { id },
      data: { primaryTableId: input.primaryTableId, orderType: "DINE_IN", version: { increment: 1 }, lockedByUserId: actor.userId, lockExpiresAt: lockExpiry() }
    });
    await transaction.auditLog.create({
      data: { actorId: actor.userId, action: "RESTAURANT_ORDER_TABLES_ASSIGNED", entityType: "HeldSale", entityId: id, metadata: { tableIds, primaryTableId: input.primaryTableId } }
    });
    return transaction.heldSale.findUniqueOrThrow({ where: { id }, include: orderInclude });
  });
  publishRestaurantChange(id, actor);
  return order;
}

export async function cancelRestaurantOrder(id: string, input: RestaurantOrderCancelInput, actor: Actor) {
  const { storeId } = await requireRestaurantMode(actor);
  const order = await prisma.$transaction(async (transaction) => {
    const existing = await requireEditableOrder(transaction, id, storeId, input.expectedVersion, actor);
    if (existing.status === "COMPLETED") throw new AppError(409, "ORDER_ALREADY_COMPLETED", "Completed orders cannot be cancelled.");
    await transaction.heldSale.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: input.reason, lockedByUserId: null, lockExpiresAt: null, version: { increment: 1 } }
    });
    await transaction.restaurantTable.updateMany({
      where: { activeOrderId: id },
      data: { activeOrderId: null, assignedStaffId: null, status: "AVAILABLE", guestCount: 0, occupiedAt: null }
    });
    await releaseOrderReservations(transaction, id, actor.userId, `Order cancelled: ${input.reason}`);
    await transaction.auditLog.create({
      data: { actorId: actor.userId, action: "RESTAURANT_ORDER_CANCELLED", entityType: "HeldSale", entityId: id, metadata: { reason: input.reason, orderNumber: existing.orderNumber } }
    });
    return transaction.heldSale.findUniqueOrThrow({ where: { id }, include: orderInclude });
  });
  publishRestaurantChange(id, actor);
  return order;
}

export async function reopenRestaurantOrder(id: string, expectedVersion: number, actor: Actor) {
  const { storeId } = await requireRestaurantMode(actor);
  const order = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.heldSale.findFirst({ where: { id, storeId, deletedAt: null } });
    if (!existing) throw new AppError(404, "ORDER_NOT_FOUND", "Restaurant order was not found.");
    if (existing.version !== expectedVersion) throw new AppError(409, "ORDER_VERSION_CONFLICT", "This order changed. Reload it before reopening.");
    if (existing.status !== "CANCELLED" || existing.completedAt || existing.mergedIntoOrderId) throw new AppError(409, "ORDER_NOT_REOPENABLE", "Only standalone cancelled, unpaid orders can be reopened.");
    await transaction.heldSale.update({
      where: { id },
      data: { status: "OPEN", cancelledAt: null, cancelReason: null, reopenedAt: new Date(), lockedByUserId: actor.userId, lockExpiresAt: lockExpiry(), version: { increment: 1 } }
    });
    await transaction.auditLog.create({
      data: { actorId: actor.userId, action: "RESTAURANT_ORDER_REOPENED", entityType: "HeldSale", entityId: id, metadata: { orderNumber: existing.orderNumber } }
    });
    return transaction.heldSale.findUniqueOrThrow({ where: { id }, include: orderInclude });
  });
  publishRestaurantChange(id, actor);
  return order;
}

function heldItemToInput(item: {
  productId: string;
  warehouseId: string | null;
  quantity: Prisma.Decimal;
  soldUnit: string;
  unitPrice: Prisma.Decimal;
  discount: Prisma.Decimal;
  note: string | null;
}): RestaurantOrderCreateInput["items"][number] {
  if (!item.warehouseId) throw new AppError(409, "ORDER_WAREHOUSE_REQUIRED", "Every order item must have an inventory location.");
  return {
    productId: item.productId,
    warehouseId: item.warehouseId,
    quantity: toNumber(item.quantity),
    soldUnit: item.soldUnit as UnitCode,
    unitPrice: toNumber(item.unitPrice),
    discount: toNumber(item.discount),
    note: item.note
  };
}

function itemSnapshot(item: {
  id: string;
  productId: string;
  warehouseId: string | null;
  quantity: Prisma.Decimal;
  soldUnit: string;
  baseQuantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  note: string | null;
}) {
  return {
    id: item.id,
    productId: item.productId,
    warehouseId: item.warehouseId,
    quantity: toNumber(item.quantity),
    soldUnit: item.soldUnit,
    baseQuantity: toNumber(item.baseQuantity),
    unitPrice: toNumber(item.unitPrice),
    discount: toNumber(item.discount),
    taxAmount: toNumber(item.taxAmount),
    lineTotal: toNumber(item.lineTotal),
    note: item.note
  };
}

export async function undoRestaurantOrderItemChange(id: string, input: RestaurantOrderUndoInput, actor: Actor) {
  const { storeId } = await requireRestaurantMode(actor);
  const order = await prisma.$transaction(async (transaction) => {
    const existing = await requireEditableOrder(transaction, id, storeId, input.expectedVersion, actor);
    const recentUpdates = await transaction.auditLog.findMany({
      where: { entityType: "HeldSale", entityId: id, action: "RESTAURANT_ORDER_UPDATED" },
      orderBy: { createdAt: "desc" },
      take: 20
    });
    const reversible = recentUpdates.find((entry) => {
      const metadata = entry.metadata as Prisma.JsonObject | null;
      return Array.isArray(metadata?.previousItems) && Array.isArray(metadata?.items) && JSON.stringify(metadata.previousItems) !== JSON.stringify(metadata.items);
    });
    if (!reversible) throw new AppError(409, "NOTHING_TO_UNDO", "There is no recent item change that can be restored.");
    const undoLogs = await transaction.auditLog.findMany({
      where: { entityType: "HeldSale", entityId: id, action: "RESTAURANT_ORDER_ITEM_CHANGE_UNDONE" },
      orderBy: { createdAt: "desc" },
      take: 20
    });
    if (undoLogs.some((entry) => (entry.metadata as Prisma.JsonObject | null)?.sourceAuditId === reversible.id)) {
      throw new AppError(409, "CHANGE_ALREADY_UNDONE", "That item change has already been undone.");
    }

    const metadata = reversible.metadata as Prisma.JsonObject;
    const previousItems = metadata.previousItems as Prisma.JsonArray;
    const restoredInputs: RestaurantOrderCreateInput["items"] = previousItems.map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppError(409, "UNDO_DATA_INVALID", "The saved item history cannot be restored.");
      const item = value as Prisma.JsonObject;
      return {
        productId: String(item.productId),
        warehouseId: String(item.warehouseId),
        quantity: Number(item.quantity),
        soldUnit: String(item.soldUnit) as UnitCode,
        unitPrice: Number(item.unitPrice),
        discount: Number(item.discount),
        note: typeof item.note === "string" ? item.note : null
      };
    });
    const restored = await prepareOrderItems(transaction, restoredInputs);
    await releaseOrderReservations(transaction, id, actor.userId, `Undo item change: ${input.reason}`);
    await transaction.heldSaleItem.updateMany({ where: { heldSaleId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    if (restored.length) await transaction.heldSaleItem.createMany({ data: restored.map((item) => ({ heldSaleId: id, ...item })) });
    const activeItems = await transaction.heldSaleItem.findMany({ where: { heldSaleId: id, deletedAt: null } });
    const totals = orderTotals(activeItems.map((item) => ({ ...item, unitPrice: toNumber(item.unitPrice), baseQuantity: toNumber(item.baseQuantity), discount: toNumber(item.discount), taxAmount: toNumber(item.taxAmount), lineTotal: toNumber(item.lineTotal) })), toNumber(existing.serviceCharge), toNumber(existing.tip));
    const updated = await transaction.heldSale.updateMany({
      where: { id, version: input.expectedVersion },
      data: { ...totals, version: { increment: 1 }, lockedByUserId: actor.userId, lockExpiresAt: lockExpiry() }
    });
    if (!updated.count) throw new AppError(409, "ORDER_VERSION_CONFLICT", "This order changed before the item edit could be undone.");
    await syncOrderReservations(transaction, existing, activeItems, actor.userId);
    await transaction.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "RESTAURANT_ORDER_ITEM_CHANGE_UNDONE",
        entityType: "HeldSale",
        entityId: id,
        metadata: { sourceAuditId: reversible.id, reason: input.reason, restoredItems: activeItems.map(itemSnapshot) }
      }
    });
    return transaction.heldSale.findUniqueOrThrow({ where: { id }, include: orderInclude });
  });
  publishRestaurantChange(id, actor);
  return order;
}

export async function mergeRestaurantOrders(targetOrderId: string, input: RestaurantOrderMergeInput, actor: Actor) {
  const { storeId } = await requireRestaurantMode(actor);
  if (targetOrderId === input.sourceOrderId) throw new AppError(400, "ORDER_MERGE_SELF", "Choose a different order to merge.");
  const order = await prisma.$transaction(async (transaction) => {
    const target = await requireEditableOrder(transaction, targetOrderId, storeId, input.expectedVersion, actor);
    const source = await requireEditableOrder(transaction, input.sourceOrderId, storeId, input.sourceExpectedVersion, actor);
    const [targetItems, sourceItems, targetTables, sourceTables] = await Promise.all([
      transaction.heldSaleItem.findMany({ where: { heldSaleId: targetOrderId, deletedAt: null } }),
      transaction.heldSaleItem.findMany({ where: { heldSaleId: source.id, deletedAt: null } }),
      transaction.restaurantTable.findMany({ where: { activeOrderId: targetOrderId } }),
      transaction.restaurantTable.findMany({ where: { activeOrderId: source.id } })
    ]);
    if (!sourceItems.length) throw new AppError(409, "SOURCE_ORDER_EMPTY", "The source order has no items to merge.");

    const combined = new Map<string, RestaurantOrderCreateInput["items"][number]>();
    for (const item of [...targetItems, ...sourceItems]) {
      const prepared = heldItemToInput(item);
      const itemKey = `${prepared.productId}:${prepared.warehouseId}:${prepared.soldUnit}:${prepared.unitPrice}`;
      const current = combined.get(itemKey);
      combined.set(itemKey, current ? { ...current, quantity: current.quantity + prepared.quantity, discount: current.discount + prepared.discount, note: [current.note, prepared.note].filter(Boolean).join("; ") || null } : prepared);
    }
    const mergedItems = await prepareOrderItems(transaction, [...combined.values()]);
    await releaseOrderReservations(transaction, target.id, actor.userId, `Orders merged: ${input.reason}`);
    await releaseOrderReservations(transaction, source.id, actor.userId, `Merged into ${target.orderNumber}: ${input.reason}`);
    await transaction.heldSaleItem.updateMany({ where: { heldSaleId: { in: [target.id, source.id] }, deletedAt: null }, data: { deletedAt: new Date() } });
    await transaction.heldSaleItem.createMany({ data: mergedItems.map((item) => ({ heldSaleId: target.id, ...item })) });
    const activeItems = await transaction.heldSaleItem.findMany({ where: { heldSaleId: target.id, deletedAt: null } });
    const serviceCharge = roundMoney(toNumber(target.serviceCharge) + toNumber(source.serviceCharge));
    const tip = roundMoney(toNumber(target.tip) + toNumber(source.tip));
    const totals = orderTotals(activeItems.map((item) => ({ ...item, unitPrice: toNumber(item.unitPrice), baseQuantity: toNumber(item.baseQuantity), discount: toNumber(item.discount), taxAmount: toNumber(item.taxAmount), lineTotal: toNumber(item.lineTotal) })), serviceCharge, tip);
    const status = reservationOrderStatuses.has(target.status) || reservationOrderStatuses.has(source.status) ? "CONFIRMED" : target.status === "DRAFT" ? "OPEN" : target.status;
    const primaryTableId = target.primaryTableId ?? source.primaryTableId;
    const updated = await transaction.heldSale.updateMany({ where: { id: target.id, version: input.expectedVersion }, data: { serviceCharge, tip, ...totals, status, primaryTableId, orderType: primaryTableId ? "DINE_IN" : target.orderType, version: { increment: 1 }, lockedByUserId: actor.userId, lockExpiresAt: lockExpiry() } });
    if (!updated.count) throw new AppError(409, "ORDER_VERSION_CONFLICT", "The target order changed during the merge.");
    await transaction.heldSale.update({ where: { id: source.id }, data: { status: "CANCELLED", mergedIntoOrderId: target.id, cancelledAt: new Date(), cancelReason: `Merged into ${target.orderNumber}: ${input.reason}`, lockedByUserId: null, lockExpiresAt: null, version: { increment: 1 } } });
    await transaction.restaurantTable.updateMany({ where: { activeOrderId: source.id }, data: { activeOrderId: target.id, assignedStaffId: actor.userId, status: orderStatusToTableStatus[status] ?? "OCCUPIED" } });
    await syncOrderReservations(transaction, { ...target, status }, activeItems, actor.userId);
    await transaction.auditLog.create({
      data: { actorId: actor.userId, action: "RESTAURANT_ORDERS_MERGED", entityType: "HeldSale", entityId: target.id, metadata: { sourceOrderId: source.id, sourceOrderNumber: source.orderNumber, targetOrderNumber: target.orderNumber, reason: input.reason, targetTableIds: targetTables.map((table) => table.id), sourceTableIds: sourceTables.map((table) => table.id), targetItems: targetItems.map(itemSnapshot), sourceItems: sourceItems.map(itemSnapshot) } }
    });
    return transaction.heldSale.findUniqueOrThrow({ where: { id: target.id }, include: orderInclude });
  });
  publishRestaurantChange(targetOrderId, actor);
  return order;
}

export async function splitRestaurantOrder(id: string, input: RestaurantOrderSplitInput, actor: Actor) {
  const { storeId } = await requireRestaurantMode(actor);
  const result = await prisma.$transaction(async (transaction) => {
    const existing = await requireEditableOrder(transaction, id, storeId, input.expectedVersion, actor);
    const currentItems = await transaction.heldSaleItem.findMany({ where: { heldSaleId: id, deletedAt: null } });
    const splitByItemId = new Map(input.items.map((item) => [item.itemId, item.quantity]));
    if (splitByItemId.size !== input.items.length) throw new AppError(400, "SPLIT_ITEM_DUPLICATE", "Each order item may only appear once in a split.");
    const unknownItem = input.items.find((selection) => !currentItems.some((item) => item.id === selection.itemId));
    if (unknownItem) throw new AppError(404, "SPLIT_ITEM_NOT_FOUND", "A selected order item no longer exists.");

    const sourceInputs: RestaurantOrderCreateInput["items"] = [];
    const splitInputs: RestaurantOrderCreateInput["items"] = [];
    for (const item of currentItems) {
      const selectedQuantity = splitByItemId.get(item.id) ?? 0;
      const quantity = toNumber(item.quantity);
      if (selectedQuantity > quantity) throw new AppError(400, "SPLIT_QUANTITY_EXCEEDS_ITEM", "Split quantity cannot exceed the item quantity.");
      const original = heldItemToInput(item);
      const discountRatio = quantity > 0 ? selectedQuantity / quantity : 0;
      if (selectedQuantity > 0) splitInputs.push({ ...original, quantity: selectedQuantity, discount: roundMoney(original.discount * discountRatio) });
      const remaining = roundMoney(quantity - selectedQuantity);
      if (remaining > 0) sourceInputs.push({ ...original, quantity: remaining, discount: roundMoney(original.discount * (1 - discountRatio)) });
    }
    if (!splitInputs.length) throw new AppError(400, "SPLIT_EMPTY", "Select at least one item quantity to split.");
    if (!sourceInputs.length) throw new AppError(409, "SPLIT_WOULD_EMPTY_ORDER", "Use table transfer instead of splitting every item from an order.");

    const requestedTables = [...input.tableIds, ...(input.primaryTableId ? [input.primaryTableId] : [])];
    const tableIds = requestedTables.length ? await validateAssignableTables(transaction, storeId, requestedTables) : [];
    if (tableIds.length && (!input.primaryTableId || !tableIds.includes(input.primaryTableId))) throw new AppError(400, "PRIMARY_TABLE_REQUIRED", "A split assigned to tables requires a primary table.");
    const [sourcePrepared, splitPrepared] = await Promise.all([prepareOrderItems(transaction, sourceInputs), prepareOrderItems(transaction, splitInputs)]);
    const combinedLineTotal = [...sourcePrepared, ...splitPrepared].reduce((sum, item) => sum + item.lineTotal, 0);
    const splitRatio = combinedLineTotal > 0 ? splitPrepared.reduce((sum, item) => sum + item.lineTotal, 0) / combinedLineTotal : 0;
    const splitServiceCharge = roundMoney(toNumber(existing.serviceCharge) * splitRatio);
    const splitTip = roundMoney(toNumber(existing.tip) * splitRatio);
    const sourceServiceCharge = roundMoney(toNumber(existing.serviceCharge) - splitServiceCharge);
    const sourceTip = roundMoney(toNumber(existing.tip) - splitTip);
    const sourceTotals = orderTotals(sourcePrepared, sourceServiceCharge, sourceTip);
    const splitTotals = orderTotals(splitPrepared, splitServiceCharge, splitTip);
    const splitOrderType = tableIds.length ? "DINE_IN" : existing.orderType === "DINE_IN" ? "WALK_IN" : existing.orderType;
    const orderNumber = await nextSequenceNumber(transaction, storeId, orderPrefix[splitOrderType] ?? "WALK");

    await releaseOrderReservations(transaction, id, actor.userId, `Order split: ${input.reason}`);
    await transaction.heldSaleItem.updateMany({ where: { heldSaleId: id, deletedAt: null }, data: { deletedAt: new Date() } });
    await transaction.heldSaleItem.createMany({ data: sourcePrepared.map((item) => ({ heldSaleId: id, ...item })) });
    const sourceUpdated = await transaction.heldSale.updateMany({ where: { id, version: input.expectedVersion }, data: { serviceCharge: sourceServiceCharge, tip: sourceTip, ...sourceTotals, version: { increment: 1 }, lockedByUserId: actor.userId, lockExpiresAt: lockExpiry() } });
    if (!sourceUpdated.count) throw new AppError(409, "ORDER_VERSION_CONFLICT", "The order changed during the split.");
    const splitOrder = await transaction.heldSale.create({
      data: { storeId, cashierId: actor.userId, splitFromOrderId: id, primaryTableId: input.primaryTableId, orderNumber, orderType: splitOrderType, customOrderType: splitOrderType === "OTHER" ? existing.customOrderType : null, status: existing.status === "DRAFT" ? "OPEN" : existing.status, label: input.customerName || orderNumber, customerName: input.customerName, guestCount: 1, note: `Split from ${existing.orderNumber}: ${input.reason}`, serviceCharge: splitServiceCharge, tip: splitTip, ...splitTotals, lockedByUserId: actor.userId, lockExpiresAt: lockExpiry(), items: { create: splitPrepared } },
      include: orderInclude
    });
    if (tableIds.length) await transaction.restaurantTable.updateMany({ where: { id: { in: tableIds } }, data: { activeOrderId: splitOrder.id, assignedStaffId: actor.userId, status: orderStatusToTableStatus[splitOrder.status] ?? "OCCUPIED", guestCount: 1, occupiedAt: new Date() } });
    const [sourceActiveItems, splitActiveItems] = await Promise.all([
      transaction.heldSaleItem.findMany({ where: { heldSaleId: id, deletedAt: null } }),
      transaction.heldSaleItem.findMany({ where: { heldSaleId: splitOrder.id, deletedAt: null } })
    ]);
    await syncOrderReservations(transaction, existing, sourceActiveItems, actor.userId);
    await syncOrderReservations(transaction, { ...splitOrder, storeId, status: splitOrder.status, orderNumber }, splitActiveItems, actor.userId);
    await transaction.auditLog.create({
      data: { actorId: actor.userId, action: "RESTAURANT_ORDER_SPLIT", entityType: "HeldSale", entityId: id, metadata: { splitOrderId: splitOrder.id, splitOrderNumber: orderNumber, reason: input.reason, items: input.items, tableIds } }
    });
    return {
      source: await transaction.heldSale.findUniqueOrThrow({ where: { id }, include: orderInclude }),
      split: await transaction.heldSale.findUniqueOrThrow({ where: { id: splitOrder.id }, include: orderInclude })
    };
  });
  publishRestaurantChange(id, actor);
  return result;
}

export async function checkoutRestaurantOrder(id: string, input: RestaurantOrderCheckoutInput, actor: Actor) {
  await requireRestaurantMode(actor);
  const sale = await completeHeldSale(id, input, actor);
  publishRestaurantChange(id, actor);
  return sale;
}
