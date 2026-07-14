import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { publishRealtimeEvent } from "../../realtime/bus.js";
import { realtimeEvents } from "../../realtime/events.js";
import { AppError } from "../../shared/app-error.js";
import type { Actor } from "../auth/actor.js";
import { calculateNextStock } from "../inventory/inventory-calculations.js";
import { nextSequenceNumber } from "./numbering.service.js";
import type { SaleRefundInput, SaleVoidInput } from "./refund.schemas.js";

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  return Number(value ?? 0);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

const refundInclude = {
  originalSale: { select: { id: true, receiptNumber: true, orderNumber: true, orderType: true, status: true } },
  items: { include: { product: { select: { id: true, sku: true, name: true } }, warehouse: { select: { id: true, code: true, name: true } } } },
  payments: true
} satisfies Prisma.RefundInclude;

type ReversalInput = SaleVoidInput & { items?: SaleRefundInput["items"] };

function allocatePayments(payments: Array<{ method: string; amount: Prisma.Decimal; reference: string | null }>, amount: number) {
  let remaining = amount;
  const allocated: Array<{ method: string; amount: number; reference: string | null }> = [];
  for (const payment of payments) {
    if (remaining <= 0) break;
    const refundAmount = roundMoney(Math.min(toNumber(payment.amount), remaining));
    if (refundAmount > 0) allocated.push({ method: payment.method, amount: refundAmount, reference: payment.reference });
    remaining = roundMoney(remaining - refundAmount);
  }
  if (remaining > 0.01) throw new AppError(409, "REFUND_PAYMENT_ALLOCATION_FAILED", "The original payment methods do not cover this reversal.");
  return allocated;
}

async function reverseSale(saleId: string, input: ReversalInput, actor: Actor, kind: "REFUND" | "VOID") {
  if (!actor.storeId) throw new AppError(400, "STORE_REQUIRED", "The operator must belong to a store.");
  const storeId = actor.storeId;
  const refund = await prisma.$transaction(async (transaction) => {
    if (input.requestKey) {
      const repeated = await transaction.refund.findUnique({ where: { requestKey: input.requestKey }, include: refundInclude });
      if (repeated) {
        if (repeated.originalSaleId !== saleId || repeated.kind !== kind) throw new AppError(409, "REQUEST_KEY_CONFLICT", "This reversal request key was already used for another operation.");
        return repeated;
      }
    }
    if (kind === "VOID") {
      const previousVoid = await transaction.refund.findFirst({ where: { originalSaleId: saleId, kind: "VOID", status: "COMPLETED", deletedAt: null }, include: refundInclude });
      if (previousVoid) return previousVoid;
    }

    const sale = await transaction.sale.findFirst({
      where: { id: saleId, storeId, deletedAt: null },
      include: {
        items: true,
        payments: true,
        refunds: { where: { status: "COMPLETED", deletedAt: null }, include: { items: true } }
      }
    });
    if (!sale) throw new AppError(404, "SALE_NOT_FOUND", "Completed sale was not found.");
    if (!["COMPLETED", "PARTIALLY_REFUNDED"].includes(sale.status)) {
      throw new AppError(409, "SALE_NOT_REVERSIBLE", "This sale has already been fully reversed or is not completed.");
    }

    const refundedSoldByItem = new Map<string, number>();
    for (const previousRefund of sale.refunds) {
      for (const item of previousRefund.items) {
        if (item.saleItemId) refundedSoldByItem.set(item.saleItemId, (refundedSoldByItem.get(item.saleItemId) ?? 0) + toNumber(item.soldQuantity));
      }
    }
    const requestedByItem = new Map<string, number>();
    if (kind === "VOID") {
      for (const item of sale.items) {
        const remaining = roundMoney(toNumber(item.soldQuantity) - (refundedSoldByItem.get(item.id) ?? 0));
        if (remaining > 0) requestedByItem.set(item.id, remaining);
      }
    } else {
      for (const item of input.items ?? []) {
        if (requestedByItem.has(item.saleItemId)) throw new AppError(400, "REFUND_ITEM_DUPLICATE", "Each sale item may only appear once in a refund.");
        requestedByItem.set(item.saleItemId, item.quantity);
      }
    }
    if (!requestedByItem.size) throw new AppError(409, "NOTHING_TO_REFUND", "No refundable quantity remains on this sale.");

    const prepared = [];
    for (const [saleItemId, soldQuantity] of requestedByItem) {
      const item = sale.items.find((candidate) => candidate.id === saleItemId);
      if (!item) throw new AppError(404, "SALE_ITEM_NOT_FOUND", "A selected sale item was not found.");
      const alreadyRefunded = refundedSoldByItem.get(item.id) ?? 0;
      const remaining = toNumber(item.soldQuantity) - alreadyRefunded;
      if (soldQuantity > remaining + 0.000001) throw new AppError(409, "REFUND_QUANTITY_EXCEEDED", `Only ${remaining} ${item.soldUnit.toLowerCase()} remains refundable.`);
      const ratio = soldQuantity / Math.max(toNumber(item.soldQuantity), 0.000001);
      const baseQuantity = toNumber(item.baseQuantity) * ratio;
      const warehouseId = item.warehouseId ?? (await transaction.inventoryMovement.findFirst({ where: { referenceType: "Sale", referenceId: sale.id, productId: item.productId, type: "SALE" }, select: { warehouseId: true }, orderBy: { createdAt: "asc" } }))?.warehouseId;
      if (!warehouseId) throw new AppError(409, "REFUND_WAREHOUSE_UNKNOWN", "The original inventory location could not be determined for this item.");
      prepared.push({ item, warehouseId, soldQuantity, baseQuantity, ratio, taxAmount: roundMoney(toNumber(item.taxAmount) * ratio), lineTotal: roundMoney(toNumber(item.lineTotal) * ratio) });
    }

    const previousRefundTotal = sale.refunds.reduce((sum, entry) => sum + toNumber(entry.grandTotal), 0);
    const itemGrandTotal = roundMoney(prepared.reduce((sum, item) => sum + item.lineTotal, 0));
    const grandTotal = kind === "VOID" ? roundMoney(toNumber(sale.grandTotal) - previousRefundTotal) : itemGrandTotal;
    if (grandTotal <= 0) throw new AppError(409, "NOTHING_TO_REFUND", "No refundable amount remains on this sale.");
    const taxTotal = roundMoney(prepared.reduce((sum, item) => sum + item.taxAmount, 0));
    const subtotal = roundMoney(grandTotal - taxTotal);
    const payments = input.payments?.length ? input.payments : allocatePayments(sale.payments, grandTotal);
    const paymentTotal = roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0));
    if (Math.abs(paymentTotal - grandTotal) > 0.01) throw new AppError(400, "REFUND_PAYMENT_MISMATCH", "Refund payments must equal the refund total.");
    const receiptNumber = await nextSequenceNumber(transaction, storeId, "REF");
    const created = await transaction.refund.create({
      data: { storeId, cashierId: actor.userId, customerId: sale.customerId, originalSaleId: sale.id, requestKey: input.requestKey, kind, receiptNumber, reason: input.reason, subtotal, taxTotal, grandTotal, status: "COMPLETED", payments: { create: payments.map((payment) => ({ method: payment.method, amount: payment.amount, reference: payment.reference })) } }
    });

    for (const entry of prepared) {
      const stock = await transaction.inventoryStock.upsert({ where: { productId_warehouseId: { productId: entry.item.productId, warehouseId: entry.warehouseId } }, update: {}, create: { productId: entry.item.productId, warehouseId: entry.warehouseId, quantity: 0 } });
      const movement = await transaction.inventoryMovement.create({
        data: { productId: entry.item.productId, warehouseId: entry.warehouseId, type: "RETURN", quantity: entry.baseQuantity, referenceType: "Refund", referenceId: created.id, reason: `${kind === "VOID" ? "Void" : "Refund"} ${receiptNumber}: ${input.reason}`, createdByUserId: actor.userId }
      });
      await transaction.inventoryStock.update({ where: { id: stock.id }, data: { quantity: calculateNextStock(toNumber(stock.quantity), entry.baseQuantity, "INCREASE") } });
      await transaction.refundItem.create({
        data: { refundId: created.id, saleItemId: entry.item.id, productId: entry.item.productId, warehouseId: entry.warehouseId, inventoryMovementId: movement.id, quantity: entry.baseQuantity, soldQuantity: entry.soldQuantity, baseQuantity: entry.baseQuantity, unitPrice: entry.item.unitPrice, taxAmount: entry.taxAmount, lineTotal: entry.lineTotal }
      });
    }

    const totalRefunded = roundMoney(previousRefundTotal + grandTotal);
    const nextSaleStatus = kind === "VOID" ? "VOIDED" : totalRefunded >= toNumber(sale.grandTotal) - 0.01 ? "REFUNDED" : "PARTIALLY_REFUNDED";
    await transaction.sale.update({ where: { id: sale.id }, data: { status: nextSaleStatus } });
    await transaction.auditLog.create({
      data: { actorId: actor.userId, action: kind === "VOID" ? "SALE_VOIDED" : "REFUND_COMPLETED", entityType: "Refund", entityId: created.id, metadata: { saleId: sale.id, saleReceiptNumber: sale.receiptNumber, refundReceiptNumber: receiptNumber, reason: input.reason, grandTotal, inventoryRestored: prepared.map((entry) => ({ productId: entry.item.productId, warehouseId: entry.warehouseId, quantity: entry.baseQuantity })) } }
    });
    await transaction.auditLog.create({
      data: { actorId: actor.userId, action: "INVENTORY_RESTORED", entityType: "Refund", entityId: created.id, metadata: { saleId: sale.id, reason: input.reason, items: prepared.map((entry) => ({ productId: entry.item.productId, warehouseId: entry.warehouseId, quantity: entry.baseQuantity })) } }
    });
    return transaction.refund.findUniqueOrThrow({ where: { id: created.id }, include: refundInclude });
  });

  const occurredAt = new Date().toISOString();
  publishRealtimeEvent(realtimeEvents.inventoryAdjusted, { entityId: refund.id, actorId: actor.userId, storeId, occurredAt });
  publishRealtimeEvent(realtimeEvents.saleCreated, { entityId: refund.originalSaleId ?? refund.id, actorId: actor.userId, storeId, occurredAt });
  return refund;
}

export async function refundSale(saleId: string, input: SaleRefundInput, actor: Actor) {
  return reverseSale(saleId, input, actor, "REFUND");
}

export async function voidSale(saleId: string, input: SaleVoidInput, actor: Actor) {
  return reverseSale(saleId, input, actor, "VOID");
}
