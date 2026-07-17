import type { LocalDatabase } from "../data/database";
import { netCashReceived } from "../domain/cash-drawer";
import { assertSufficientPayment, lineTotals, saleTotals, toBaseQuantity } from "../domain/calculations";
import { createId, nowIso, type CartLine, type SaleCommand, type SaleSummary, type UnitCode } from "../domain/models";
import { audit, nextNumber } from "./service-helpers";
import { recordAutomaticCashMovement } from "./cash-drawer-service";
import { operationCoordinator, type OperationCoordinator } from "./operation-coordinator";

type ProductSaleRow = {
  id: string;
  name: string;
  inventory_unit: UnitCode;
  selling_unit: UnitCode;
  unit_ratio_micro: number;
  retail_price_cents: number;
  wholesale_price_cents: number;
  wholesale_threshold_micro: number;
  tax_basis_points: number;
  quantity_micro: number;
};

type PreparedLine = CartLine & {
  warehouseId: string;
  totals: ReturnType<typeof lineTotals>;
};

export type SaleDetail = SaleSummary & {
  businessName: string;
  cashierName: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  serviceChargeCents: number;
  tipCents: number;
  lines: Array<{
    id: string;
    productId: string;
    name: string;
    soldQuantityMicro: number;
    refundedQuantityMicro: number;
    soldUnit: UnitCode;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
  payments: Array<{ method: string; amountCents: number; reference: string | null }>;
};

export class SalesService {
  constructor(private db: LocalDatabase, private operations: OperationCoordinator = operationCoordinator, private protectedOperation: () => Promise<unknown> = async () => undefined) {}

  private async saleSummary(id: string) {
    const rows = await this.db.query<{
      id: string;
      receipt_number: string;
      order_number: string | null;
      order_type: string;
      status: string;
      grand_total_cents: number;
      paid_total_cents: number;
      change_total_cents: number;
      created_at: string;
    }>("SELECT id, receipt_number, order_number, order_type, status, grand_total_cents, paid_total_cents, change_total_cents, created_at FROM sales WHERE id=?", [id]);
    const row = rows[0];
    if (!row) throw new Error("Sale was not found.");
    return {
      id: row.id,
      receiptNumber: row.receipt_number,
      orderNumber: row.order_number,
      orderType: row.order_type,
      status: row.status,
      grandTotalCents: Number(row.grand_total_cents),
      paidTotalCents: Number(row.paid_total_cents),
      changeTotalCents: Number(row.change_total_cents),
      createdAt: row.created_at
    } satisfies SaleSummary;
  }

  async completeSale(command: SaleCommand) {
    await this.protectedOperation();
    const releasePayment = this.operations.beginPayment();
    try {
      const existing = await this.db.query<{ id: string }>("SELECT id FROM sales WHERE request_key=?", [command.requestKey]);
      if (existing[0]) return await this.saleSummary(existing[0].id);
      if (!command.lines.length && !command.orderId) throw new Error("Add at least one item before completing the sale.");

      return await this.db.transaction(async () => {
      const repeated = await this.db.query<{ id: string }>("SELECT id FROM sales WHERE request_key=?", [command.requestKey]);
      if (repeated[0]) return this.saleSummary(repeated[0].id);

      let sourceLines = command.lines;
      let orderNumber: string | null = null;
      let orderType = command.orderType;
      let customOrderType = command.customOrderType ?? null;
      let orderVersion: number | null = null;
      if (command.orderId) {
        const orderRows = await this.db.query<{ order_number: string; order_type: SaleCommand["orderType"]; custom_order_type: string | null; status: string; version: number }>(
          "SELECT order_number, order_type, custom_order_type, status, version FROM orders WHERE id=? AND deleted_at IS NULL",
          [command.orderId]
        );
        const order = orderRows[0];
        if (!order) throw new Error("Restaurant order was not found.");
        if (["COMPLETED", "CANCELLED"].includes(order.status)) throw new Error("This order cannot be checked out.");
        const itemRows = await this.db.query<{
          product_id: string;
          product_name: string;
          sold_quantity_micro: number;
          sold_unit: UnitCode;
          base_quantity_micro: number;
          unit_price_cents: number;
          discount_cents: number;
          tax_basis_points: number;
        }>(
          `SELECT oi.product_id, p.name AS product_name, oi.sold_quantity_micro, oi.sold_unit, oi.base_quantity_micro,
             oi.unit_price_cents, oi.discount_cents, oi.tax_basis_points
           FROM order_items oi JOIN products p ON p.id=oi.product_id WHERE oi.order_id=? AND oi.deleted_at IS NULL`,
          [command.orderId]
        );
        if (!itemRows.length) throw new Error("Add at least one item before completing the order.");
        sourceLines = itemRows.map((item) => ({
          productId: item.product_id,
          name: item.product_name,
          soldQuantityMicro: Number(item.sold_quantity_micro),
          soldUnit: item.sold_unit,
          baseQuantityMicro: Number(item.base_quantity_micro),
          unitPriceCents: Number(item.unit_price_cents),
          discountCents: Number(item.discount_cents),
          taxBasisPoints: Number(item.tax_basis_points)
        }));
        orderNumber = order.order_number;
        orderType = order.order_type;
        customOrderType = order.custom_order_type;
        orderVersion = Number(order.version);
      }

      const prepared: PreparedLine[] = [];
      for (const requested of sourceLines) {
        const products = await this.db.query<ProductSaleRow>(
          `SELECT p.id, p.name, p.inventory_unit, p.selling_unit, p.unit_ratio_micro, p.retail_price_cents,
             p.wholesale_price_cents, p.wholesale_threshold_micro, p.tax_basis_points, COALESCE(s.quantity_micro,0) AS quantity_micro
           FROM products p LEFT JOIN inventory_stock s ON s.product_id=p.id AND s.warehouse_id='warehouse_main'
           WHERE p.id=? AND p.status='ACTIVE' AND p.deleted_at IS NULL`,
          [requested.productId]
        );
        const product = products[0];
        if (!product) throw new Error(`${requested.name} is no longer available.`);
        const baseQuantityMicro = toBaseQuantity(requested.soldQuantityMicro, Number(product.unit_ratio_micro));
        const reservationRows = await this.db.query<{ reserved_micro: number }>(
          `SELECT COALESCE(SUM(quantity_micro),0) AS reserved_micro FROM inventory_reservations
           WHERE product_id=? AND warehouse_id='warehouse_main' AND status='ACTIVE' AND (? IS NULL OR order_id<>?)`,
          [requested.productId, command.orderId ?? null, command.orderId ?? null]
        );
        const availableMicro = Number(product.quantity_micro) - Number(reservationRows[0]?.reserved_micro ?? 0);
        if (baseQuantityMicro > availableMicro) throw new Error(`${product.name} has insufficient available stock.`);
        const price = Number(product.wholesale_threshold_micro) > 0 && baseQuantityMicro >= Number(product.wholesale_threshold_micro)
          ? Number(product.wholesale_price_cents)
          : Number(product.retail_price_cents);
        const line: CartLine = {
          productId: product.id,
          name: product.name,
          soldQuantityMicro: requested.soldQuantityMicro,
          soldUnit: requested.soldUnit,
          baseQuantityMicro,
          unitPriceCents: price,
          discountCents: requested.discountCents,
          taxBasisPoints: Number(product.tax_basis_points)
        };
        prepared.push({ ...line, warehouseId: "warehouse_main", totals: lineTotals(line) });
      }

      const serviceChargeCents = command.serviceChargeCents ?? 0;
      const tipCents = command.tipCents ?? 0;
      const totals = saleTotals(prepared, serviceChargeCents, tipCents);
      const paidTotalCents = command.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
      const changeTotalCents = assertSufficientPayment(paidTotalCents, totals.grandTotalCents);
      const saleId = createId("sale");
      const receiptNumber = await nextNumber(this.db, "SALE");
      const now = nowIso();
      await this.db.run(
        `INSERT INTO sales(id, request_key, order_id, receipt_number, order_number, order_type, custom_order_type, cashier_id,
         subtotal_cents, discount_cents, tax_cents, service_charge_cents, tip_cents, grand_total_cents, paid_total_cents, change_total_cents, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [saleId, command.requestKey, command.orderId ?? null, receiptNumber, orderNumber, orderType, customOrderType, command.cashierId,
          totals.subtotalCents, totals.discountCents, totals.taxCents, serviceChargeCents, tipCents, totals.grandTotalCents, paidTotalCents, changeTotalCents, now, now],
        false
      );

      for (const line of prepared) {
        const saleItemId = createId("saleitem");
        await this.db.run(
          `INSERT INTO sale_items(id, sale_id, product_id, warehouse_id, sold_quantity_micro, sold_unit, base_quantity_micro,
           unit_price_cents, discount_cents, tax_cents, line_total_cents) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [saleItemId, saleId, line.productId, line.warehouseId, line.soldQuantityMicro, line.soldUnit, line.baseQuantityMicro, line.unitPriceCents, line.totals.discountCents, line.totals.taxCents, line.totals.totalCents],
          false
        );
        await this.db.run("UPDATE inventory_stock SET quantity_micro=quantity_micro-?, updated_at=? WHERE product_id=? AND warehouse_id=?", [line.baseQuantityMicro, now, line.productId, line.warehouseId], false);
        await this.db.run(
          "INSERT INTO inventory_movements(id, product_id, warehouse_id, type, quantity_micro, reference_type, reference_id, reason, actor_id, created_at) VALUES (?, ?, ?, 'SALE', ?, 'Sale', ?, ?, ?, ?)",
          [createId("movement"), line.productId, line.warehouseId, -line.baseQuantityMicro, saleId, `Sale ${receiptNumber}`, command.cashierId, now],
          false
        );
      }
      for (const payment of command.payments.filter((entry) => entry.amountCents > 0)) {
        await this.db.run("INSERT INTO sale_payments(id, sale_id, method, amount_cents, reference, created_at) VALUES (?, ?, ?, ?, ?, ?)", [createId("payment"), saleId, payment.method, payment.amountCents, payment.reference ?? null, now], false);
      }
      const cashReceivedCents = netCashReceived(
        command.payments.filter((payment) => payment.method === "CASH").reduce((sum, payment) => sum + payment.amountCents, 0),
        changeTotalCents
      );
      if (cashReceivedCents > 0) {
        const cashSessionId = await recordAutomaticCashMovement(this.db, {
          requestKey: `sale:${saleId}`,
          actorId: command.cashierId,
          type: "SALE",
          amountCents: cashReceivedCents,
          relatedId: saleId,
          reference: receiptNumber,
          createdAt: now
        });
        await this.db.run("UPDATE sales SET cash_session_id=? WHERE id=?", [cashSessionId, saleId], false);
      }
      if (command.orderId) {
        const changed = await this.db.run(
          "UPDATE orders SET status='COMPLETED', completed_at=?, updated_at=?, version=version+1 WHERE id=? AND version=? AND status NOT IN ('COMPLETED','CANCELLED')",
          [now, now, command.orderId, orderVersion],
          false
        );
        if (Number(changed.changes?.changes ?? 0) !== 1) throw new Error("The order changed before payment. Reload and try again.");
        await this.db.run("UPDATE inventory_reservations SET status='CONSUMED', updated_at=? WHERE order_id=? AND status='ACTIVE'", [now, command.orderId], false);
        await this.db.run("UPDATE restaurant_tables SET active_order_id=NULL, status='CLEANING', guest_count=0, updated_at=?, version=version+1 WHERE active_order_id=?", [now, command.orderId], false);
      }
      await audit(this.db, { actorId: command.cashierId, action: "SALE_COMPLETED", entityType: "Sale", entityId: saleId, metadata: { receiptNumber, orderNumber, grandTotalCents: totals.grandTotalCents } });
      return this.saleSummary(saleId);
      });
    } finally {
      releasePayment();
    }
  }

  async listSales(limit = 200) {
    const rows = await this.db.query<{
      id: string; receipt_number: string; order_number: string | null; order_type: string; status: string;
      grand_total_cents: number; paid_total_cents: number; change_total_cents: number; created_at: string;
    }>("SELECT id, receipt_number, order_number, order_type, status, grand_total_cents, paid_total_cents, change_total_cents, created_at FROM sales WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT ?", [Math.min(Math.max(limit, 1), 1000)]);
    return rows.map((row) => ({
      id: row.id, receiptNumber: row.receipt_number, orderNumber: row.order_number, orderType: row.order_type, status: row.status,
      grandTotalCents: Number(row.grand_total_cents), paidTotalCents: Number(row.paid_total_cents), changeTotalCents: Number(row.change_total_cents), createdAt: row.created_at
    } satisfies SaleSummary));
  }

  async getSale(id: string): Promise<SaleDetail> {
    const rows = await this.db.query<{
      id: string; receipt_number: string; order_number: string | null; order_type: string; status: string; subtotal_cents: number;
      discount_cents: number; tax_cents: number; service_charge_cents: number; tip_cents: number; grand_total_cents: number;
      paid_total_cents: number; change_total_cents: number; created_at: string; cashier_name: string;
    }>(`SELECT s.*, u.name AS cashier_name FROM sales s JOIN users u ON u.id=s.cashier_id WHERE s.id=? AND s.deleted_at IS NULL`, [id]);
    const sale = rows[0];
    if (!sale) throw new Error("Sale was not found.");
    const lineRows = await this.db.query<{
      id: string; product_id: string; name: string; sold_quantity_micro: number; refunded_quantity_micro: number; sold_unit: UnitCode; unit_price_cents: number; line_total_cents: number;
    }>(`SELECT si.id, si.product_id, p.name, si.sold_quantity_micro, si.sold_unit, si.unit_price_cents, si.line_total_cents,
        COALESCE((SELECT SUM(ri.sold_quantity_micro) FROM refund_items ri JOIN refunds r ON r.id=ri.refund_id
          WHERE ri.sale_item_id=si.id AND r.status='COMPLETED'), 0) AS refunded_quantity_micro
       FROM sale_items si JOIN products p ON p.id=si.product_id WHERE si.sale_id=? ORDER BY si.id`, [id]);
    const paymentRows = await this.db.query<{ method: string; amount_cents: number; reference: string | null }>("SELECT method, amount_cents, reference FROM sale_payments WHERE sale_id=? ORDER BY created_at", [id]);
    const settingRows = await this.db.query<{ value_json: string }>("SELECT value_json FROM settings WHERE key='app'");
    const setting = settingRows[0] ? JSON.parse(settingRows[0].value_json) as { businessName?: string } : {};
    return {
      id: sale.id, receiptNumber: sale.receipt_number, orderNumber: sale.order_number, orderType: sale.order_type, status: sale.status,
      grandTotalCents: Number(sale.grand_total_cents), paidTotalCents: Number(sale.paid_total_cents), changeTotalCents: Number(sale.change_total_cents), createdAt: sale.created_at,
      businessName: setting.businessName ?? "Suki Sync Store", cashierName: sale.cashier_name, subtotalCents: Number(sale.subtotal_cents),
      discountCents: Number(sale.discount_cents), taxCents: Number(sale.tax_cents), serviceChargeCents: Number(sale.service_charge_cents), tipCents: Number(sale.tip_cents),
      lines: lineRows.map((line) => ({ id: line.id, productId: line.product_id, name: line.name, soldQuantityMicro: Number(line.sold_quantity_micro), refundedQuantityMicro: Number(line.refunded_quantity_micro), soldUnit: line.sold_unit, unitPriceCents: Number(line.unit_price_cents), lineTotalCents: Number(line.line_total_cents) })),
      payments: paymentRows.map((payment) => ({ method: payment.method, amountCents: Number(payment.amount_cents), reference: payment.reference }))
    };
  }

  async reverseSale(input: { saleId: string; requestKey: string; cashierId: string; reason: string; kind: "REFUND" | "VOID"; items?: Array<{ saleItemId: string; soldQuantityMicro: number }> }) {
    if (input.reason.trim().length < 3) throw new Error("A reversal reason is required.");
    const users = await this.db.query<{ permissions_json: string }>(
      "SELECT r.permissions_json FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.status='ACTIVE' AND u.deleted_at IS NULL",
      [input.cashierId]
    );
    const permissions = users[0] ? JSON.parse(users[0].permissions_json) as string[] : [];
    const requiredPermission = input.kind === "VOID" ? "sales.void" : "sales.refund";
    if (!permissions.includes("*") && !permissions.includes(requiredPermission)) throw new Error("Manager authorization is required for this action.");
    const existing = await this.db.query<{ id: string }>("SELECT id FROM refunds WHERE request_key=?", [input.requestKey]);
    if (existing[0]) return existing[0].id;
    return this.db.transaction(async () => {
      const sales = await this.db.query<{ status: string; grand_total_cents: number }>("SELECT status, grand_total_cents FROM sales WHERE id=? AND deleted_at IS NULL", [input.saleId]);
      const sale = sales[0];
      if (!sale || !["COMPLETED", "PARTIALLY_REFUNDED"].includes(sale.status)) throw new Error("This sale cannot be reversed.");
      const items = await this.db.query<{
        id: string; product_id: string; warehouse_id: string; sold_quantity_micro: number; base_quantity_micro: number; line_total_cents: number; tax_cents: number; refunded_micro: number;
      }>(
        `SELECT si.*, COALESCE((SELECT SUM(ri.sold_quantity_micro) FROM refund_items ri JOIN refunds r ON r.id=ri.refund_id WHERE ri.sale_item_id=si.id AND r.status='COMPLETED'),0) AS refunded_micro
         FROM sale_items si WHERE si.sale_id=?`,
        [input.saleId]
      );
      const selected = input.kind === "VOID"
        ? items.map((item) => ({ saleItemId: item.id, soldQuantityMicro: Number(item.sold_quantity_micro) - Number(item.refunded_micro) })).filter((item) => item.soldQuantityMicro > 0)
        : input.items ?? [];
      if (!selected.length) throw new Error("No refundable quantity remains.");
      const refundId = createId("refund");
      const now = nowIso();
      let grandTotalCents = 0;
      const prepared = selected.map((request) => {
        const item = items.find((candidate) => candidate.id === request.saleItemId);
        if (!item) throw new Error("A refund item was not found.");
        const remaining = Number(item.sold_quantity_micro) - Number(item.refunded_micro);
        if (request.soldQuantityMicro <= 0 || request.soldQuantityMicro > remaining) throw new Error("Refund quantity exceeds the remaining sold quantity.");
        const ratio = request.soldQuantityMicro / Number(item.sold_quantity_micro);
        const baseQuantityMicro = Math.round(Number(item.base_quantity_micro) * ratio);
        const lineTotalCents = Math.round(Number(item.line_total_cents) * ratio);
        const taxCents = Math.round(Number(item.tax_cents) * ratio);
        grandTotalCents += lineTotalCents;
        return { item, soldQuantityMicro: request.soldQuantityMicro, baseQuantityMicro, lineTotalCents, taxCents };
      });
      const taxCents = prepared.reduce((sum, entry) => sum + entry.taxCents, 0);
      const receiptNumber = await nextNumber(this.db, "REFUND");
      await this.db.run(
        "INSERT INTO refunds(id, request_key, original_sale_id, receipt_number, kind, reason, cashier_id, subtotal_cents, tax_cents, grand_total_cents, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [refundId, input.requestKey, input.saleId, receiptNumber, input.kind, input.reason.trim(), input.cashierId, grandTotalCents - taxCents, taxCents, grandTotalCents, now],
        false
      );
      const originalPayments = await this.db.query<{ method: string; amount_cents: number }>(
        `SELECT sp.method, SUM(sp.amount_cents) - CASE WHEN sp.method='CASH' THEN s.change_total_cents ELSE 0 END AS amount_cents
         FROM sale_payments sp JOIN sales s ON s.id=sp.sale_id WHERE sp.sale_id=? GROUP BY sp.method, s.change_total_cents ORDER BY sp.method`,
        [input.saleId]
      );
      let paymentRemaining = grandTotalCents;
      let cashRefundCents = 0;
      for (const payment of originalPayments) {
        const amount = Math.min(paymentRemaining, Number(payment.amount_cents));
        if (amount <= 0) continue;
        await this.db.run("INSERT INTO refund_payments(id, refund_id, method, amount_cents, created_at) VALUES (?, ?, ?, ?, ?)", [createId("refundpayment"), refundId, payment.method, amount, now], false);
        if (payment.method === "CASH") cashRefundCents += amount;
        paymentRemaining -= amount;
      }
      if (paymentRemaining > 0) await this.db.run("INSERT INTO refund_payments(id, refund_id, method, amount_cents, created_at) VALUES (?, ?, 'OTHER', ?, ?)", [createId("refundpayment"), refundId, paymentRemaining, now], false);
      if (cashRefundCents > 0) {
        const cashSessionId = await recordAutomaticCashMovement(this.db, {
          requestKey: `refund:${refundId}`,
          actorId: input.cashierId,
          type: "REFUND",
          amountCents: cashRefundCents,
          relatedId: refundId,
          reference: receiptNumber,
          createdAt: now
        });
        await this.db.run("UPDATE refunds SET cash_session_id=? WHERE id=?", [cashSessionId, refundId], false);
      }
      for (const entry of prepared) {
        const movementId = createId("movement");
        await this.db.run("UPDATE inventory_stock SET quantity_micro=quantity_micro+?, updated_at=? WHERE product_id=? AND warehouse_id=?", [entry.baseQuantityMicro, now, entry.item.product_id, entry.item.warehouse_id], false);
        await this.db.run(
          "INSERT INTO inventory_movements(id, product_id, warehouse_id, type, quantity_micro, reference_type, reference_id, reason, actor_id, created_at) VALUES (?, ?, ?, 'RETURN', ?, 'Refund', ?, ?, ?, ?)",
          [movementId, entry.item.product_id, entry.item.warehouse_id, entry.baseQuantityMicro, refundId, input.reason.trim(), input.cashierId, now],
          false
        );
        await this.db.run(
          "INSERT INTO refund_items(id, refund_id, sale_item_id, product_id, warehouse_id, sold_quantity_micro, base_quantity_micro, line_total_cents, inventory_movement_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [createId("refunditem"), refundId, entry.item.id, entry.item.product_id, entry.item.warehouse_id, entry.soldQuantityMicro, entry.baseQuantityMicro, entry.lineTotalCents, movementId],
          false
        );
      }
      const stillRefundable = items.some((item) => {
        const newly = prepared.find((entry) => entry.item.id === item.id)?.soldQuantityMicro ?? 0;
        return Number(item.sold_quantity_micro) - Number(item.refunded_micro) - newly > 0;
      });
      await this.db.run("UPDATE sales SET status=?, updated_at=? WHERE id=?", [input.kind === "VOID" && !stillRefundable ? "VOIDED" : stillRefundable ? "PARTIALLY_REFUNDED" : "REFUNDED", now, input.saleId], false);
      await audit(this.db, { actorId: input.cashierId, action: input.kind === "VOID" ? "SALE_VOIDED" : "SALE_REFUNDED", entityType: "Sale", entityId: input.saleId, reason: input.reason, metadata: { refundId, grandTotalCents } });
      return refundId;
    });
  }
}
