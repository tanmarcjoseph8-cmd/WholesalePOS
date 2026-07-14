import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { publishRealtimeEvent } from "../../realtime/bus.js";
import { realtimeEvents } from "../../realtime/events.js";
import { AppError } from "../../shared/app-error.js";
import { buildPaginatedResponse, getPagination } from "../../shared/pagination.js";
import type { Actor } from "../auth/actor.js";
import { calculateNextStock } from "../inventory/inventory-calculations.js";
import { calculateVariableSaleLine, type UnitCode } from "../inventory/unit-conversion.js";
import type { SaleCreateInput, SaleListQuery } from "./sale.schemas.js";

function toNumber(value: Prisma.Decimal | number) {
  return Number(value);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

async function nextReceiptNumber(transaction: Prisma.TransactionClient, storeId: string) {
  const sequence = await transaction.receiptSequence.upsert({
    where: { storeId_prefix: { storeId, prefix: "POS" } },
    update: { nextNumber: { increment: 1 } },
    create: { storeId, prefix: "POS", nextNumber: 2, padding: 6 }
  });
  return `${sequence.prefix}-${String(sequence.nextNumber - 1).padStart(sequence.padding, "0")}`;
}

export async function listSales(query: SaleListQuery) {
  const { page, pageSize, skip, take } = getPagination(query);
  const where = { orderType: query.orderType };
  const [items, total] = await prisma.$transaction([
    prisma.sale.findMany({
      where,
      include: {
        cashier: { select: { id: true, name: true, email: true } },
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        payments: true
      },
      orderBy: { createdAt: "desc" },
      skip,
      take
    }),
    prisma.sale.count({ where })
  ]);

  return buildPaginatedResponse(items, total, page, pageSize);
}

export async function createSale(input: SaleCreateInput, actor: Actor) {
  if (!actor.storeId) {
    throw new AppError(400, "STORE_REQUIRED", "The cashier must belong to a store before selling.");
  }
  const storeId = actor.storeId;
  const orderType = input.orderType ?? "RETAIL";
  const serviceCharge = input.serviceCharge ?? 0;
  const tip = input.tip ?? 0;

  const sale = await prisma.$transaction(async (transaction) => {
    const receiptNumber = await nextReceiptNumber(transaction, storeId);
    const preparedItems = [];

    for (const item of input.items) {
      const product = await transaction.product.findFirst({
        where: { id: item.productId, deletedAt: null, status: "ACTIVE" },
        select: {
          id: true,
          name: true,
          inventoryUnit: true,
          sellingUnit: true,
          packageSize: true,
          retailPrice: true,
          wholesalePrice: true,
          wholesaleThreshold: true,
          taxRate: true
        }
      });
      if (!product) {
        throw new AppError(404, "PRODUCT_NOT_FOUND", "Product was not found.");
      }

      const stock = await transaction.inventoryStock.upsert({
        where: { productId_warehouseId: { productId: item.productId, warehouseId: item.warehouseId } },
        update: {},
        create: { productId: item.productId, warehouseId: item.warehouseId, quantity: 0 }
      });
      const soldUnit = (item.soldUnit ?? product.sellingUnit) as UnitCode;
      const baseUnit = product.inventoryUnit as UnitCode;
      const packageSize = toNumber(product.packageSize);
      const baseQuantityForPricing = calculateVariableSaleLine({
        packagePrice: toNumber(product.retailPrice),
        packageSize,
        soldQuantity: item.quantity,
        soldUnit,
        inventoryUnit: baseUnit
      }).baseQuantity;
      const packagePrice =
        toNumber(product.wholesaleThreshold) > 0 && baseQuantityForPricing >= toNumber(product.wholesaleThreshold)
          ? toNumber(product.wholesalePrice)
          : toNumber(product.retailPrice);
      const saleLine = calculateVariableSaleLine({
        packagePrice,
        packageSize,
        soldQuantity: item.quantity,
        soldUnit,
        inventoryUnit: baseUnit
      });
      const nextQuantity = calculateNextStock(toNumber(stock.quantity), saleLine.baseQuantity, "DECREASE");
      const unitPrice = item.unitPrice ?? saleLine.unitPrice;
      const gross = roundMoney(unitPrice * saleLine.baseQuantity);
      const lineDiscount = Math.min(item.discount, gross);
      const taxable = gross - lineDiscount;
      const taxAmount = roundMoney(taxable * toNumber(product.taxRate));
      const lineTotal = roundMoney(taxable + taxAmount);

      preparedItems.push({ input: item, product, stock, nextQuantity, soldUnit, baseQuantity: saleLine.baseQuantity, unitPrice, discount: lineDiscount, taxAmount, lineTotal });
    }

    const subtotal = roundMoney(preparedItems.reduce((sum, item) => sum + item.unitPrice * item.baseQuantity, 0));
    const discountTotal = roundMoney(preparedItems.reduce((sum, item) => sum + item.discount, 0));
    const taxTotal = roundMoney(preparedItems.reduce((sum, item) => sum + item.taxAmount, 0));
    const grandTotal = roundMoney(preparedItems.reduce((sum, item) => sum + item.lineTotal, 0) + serviceCharge + tip);
    const paidTotal = roundMoney(input.payments.reduce((sum, payment) => sum + payment.amount, 0));

    if (paidTotal < grandTotal) {
      throw new AppError(400, "PAYMENT_INSUFFICIENT", "Payment total is less than the sale total.");
    }

    const sale = await transaction.sale.create({
      data: {
        storeId,
        cashierId: actor.userId,
        customerId: input.customerId ?? undefined,
        receiptNumber,
        orderNumber: input.orderNumber ?? undefined,
        orderType,
        subtotal,
        discountTotal,
        taxTotal,
        grandTotal,
        paidTotal,
        changeTotal: roundMoney(paidTotal - grandTotal),
        serviceCharge,
        tip,
        items: {
          create: preparedItems.map((item) => ({
            productId: item.input.productId,
            quantity: item.baseQuantity,
            soldQuantity: item.input.quantity,
            soldUnit: item.soldUnit,
            baseQuantity: item.baseQuantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
            taxAmount: item.taxAmount,
            lineTotal: item.lineTotal
          }))
        },
        payments: {
          create: input.payments.map((payment) => ({
            method: payment.method,
            amount: payment.amount,
            reference: payment.reference
          }))
        }
      },
      include: {
        items: { include: { product: { select: { id: true, name: true, sku: true } } } },
        payments: true
      }
    });

    for (const item of preparedItems) {
      await transaction.inventoryStock.update({
        where: { id: item.stock.id },
        data: { quantity: item.nextQuantity }
      });
      await transaction.inventoryMovement.create({
        data: {
          productId: item.input.productId,
          warehouseId: item.input.warehouseId,
          type: "SALE",
          quantity: -item.baseQuantity,
          referenceType: "Sale",
          referenceId: sale.id,
          reason: `Sale ${sale.receiptNumber}`,
          createdByUserId: actor.userId
        }
      });
    }

    await transaction.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "SALE_COMPLETED",
        entityType: "Sale",
        entityId: sale.id,
        metadata: {
          receiptNumber,
          orderNumber: input.orderNumber,
          orderType,
          grandTotal,
          paidTotal,
          serviceCharge,
          tip,
          paymentMethods: input.payments.map((payment) => payment.method)
        }
      }
    });

    return sale;
  });

  const occurredAt = new Date().toISOString();
  publishRealtimeEvent(realtimeEvents.saleCreated, {
    entityId: sale.id,
    actorId: actor.userId,
    storeId,
    occurredAt
  });
  publishRealtimeEvent(realtimeEvents.inventoryAdjusted, {
    entityId: sale.id,
    actorId: actor.userId,
    storeId,
    occurredAt
  });

  return sale;
}
