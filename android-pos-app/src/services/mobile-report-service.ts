import type { LocalDatabase } from "../data/database";
import {
  buildSalesReport,
  reportRange,
  type ReportItemRow,
  type ReportPaymentRow,
  type ReportPreset,
  type ReportRefundPaymentRow,
  type ReportRefundRow,
  type ReportSaleRow,
  type SalesReportSource
} from "../domain/reporting";
import type { LocalUser, UnitCode } from "../domain/models";
import type { SettingsReportService } from "./settings-report-service";

function requireReportsPermission(actor: LocalUser) {
  if (!actor.permissions.includes("*") && !actor.permissions.includes("reports.view")) throw new Error("Reports permission is required.");
}

export class MobileReportService {
  constructor(private db: LocalDatabase, private settings: SettingsReportService) {}

  async getSalesReport(actor: LocalUser, preset: ReportPreset, custom: { fromDate: string; toDate: string } | null = null) {
    requireReportsPermission(actor);
    const settings = await this.settings.getSettings();
    const range = reportRange(preset, settings.businessTimezone, custom);
    const parameters = [range.startIso, range.endExclusiveIso];

    const saleRows = await this.db.query<{
      id: string; receipt_number: string; order_number: string | null; order_type: string; custom_order_type: string | null;
      table_number: string | null; status: string; subtotal_cents: number; discount_cents: number; tax_cents: number;
      service_charge_cents: number; tip_cents: number; grand_total_cents: number; created_at: string;
    }>(
      `SELECT s.id, s.receipt_number, s.order_number, s.order_type, s.custom_order_type, t.number AS table_number,
        s.status, s.subtotal_cents, s.discount_cents, s.tax_cents, s.service_charge_cents, s.tip_cents,
        s.grand_total_cents, s.created_at
       FROM sales s LEFT JOIN orders o ON o.id=s.order_id LEFT JOIN restaurant_tables t ON t.id=o.primary_table_id
       WHERE s.created_at>=? AND s.created_at<? AND s.deleted_at IS NULL
         AND s.status IN ('COMPLETED','PARTIALLY_REFUNDED','REFUNDED','VOIDED')
       ORDER BY s.created_at DESC`,
      parameters
    );
    const sales: ReportSaleRow[] = saleRows.map((row) => ({
      id: row.id,
      receiptNumber: row.receipt_number,
      orderNumber: row.order_number,
      orderType: row.order_type,
      customOrderType: row.custom_order_type,
      tableNumber: row.table_number,
      status: row.status,
      subtotalCents: Number(row.subtotal_cents),
      discountCents: Number(row.discount_cents),
      taxCents: Number(row.tax_cents),
      serviceChargeCents: Number(row.service_charge_cents),
      tipCents: Number(row.tip_cents),
      grandTotalCents: Number(row.grand_total_cents),
      createdAt: row.created_at
    }));

    const itemRows = await this.db.query<{
      sale_id: string; sale_status: string; product_id: string; sku: string; product_name: string; sold_unit: UnitCode;
      sold_quantity_micro: number; line_total_cents: number; refunded_quantity_micro: number; refunded_line_total_cents: number;
    }>(
      `SELECT si.sale_id, s.status AS sale_status, si.product_id, p.sku, p.name AS product_name, si.sold_unit,
        si.sold_quantity_micro, si.line_total_cents,
        COALESCE(SUM(CASE WHEN r.status='COMPLETED' THEN ri.sold_quantity_micro ELSE 0 END),0) AS refunded_quantity_micro,
        COALESCE(SUM(CASE WHEN r.status='COMPLETED' THEN ri.line_total_cents ELSE 0 END),0) AS refunded_line_total_cents
       FROM sale_items si JOIN sales s ON s.id=si.sale_id JOIN products p ON p.id=si.product_id
       LEFT JOIN refund_items ri ON ri.sale_item_id=si.id LEFT JOIN refunds r ON r.id=ri.refund_id
       WHERE s.created_at>=? AND s.created_at<? AND s.deleted_at IS NULL
         AND s.status IN ('COMPLETED','PARTIALLY_REFUNDED','REFUNDED','VOIDED')
       GROUP BY si.id, s.status, p.sku, p.name`,
      parameters
    );
    const items: ReportItemRow[] = itemRows.map((row) => ({
      saleId: row.sale_id,
      saleStatus: row.sale_status,
      productId: row.product_id,
      sku: row.sku,
      productName: row.product_name,
      soldUnit: row.sold_unit,
      soldQuantityMicro: Number(row.sold_quantity_micro),
      lineTotalCents: Number(row.line_total_cents),
      refundedQuantityMicro: Number(row.refunded_quantity_micro),
      refundedLineTotalCents: Number(row.refunded_line_total_cents)
    }));

    const paymentRows = await this.db.query<{ sale_id: string; sale_status: string; method: string; amount_cents: number }>(
      `SELECT sp.sale_id, s.status AS sale_status, sp.method,
              SUM(sp.amount_cents) - CASE WHEN sp.method='CASH' THEN s.change_total_cents ELSE 0 END AS amount_cents
       FROM sale_payments sp JOIN sales s ON s.id=sp.sale_id
       WHERE s.created_at>=? AND s.created_at<? AND s.deleted_at IS NULL
         AND s.status IN ('COMPLETED','PARTIALLY_REFUNDED','REFUNDED','VOIDED')
       GROUP BY sp.sale_id, s.status, sp.method, s.change_total_cents`,
      parameters
    );
    const payments: ReportPaymentRow[] = paymentRows.map((row) => ({ saleId: row.sale_id, saleStatus: row.sale_status, method: row.method, amountCents: Number(row.amount_cents) }));

    const refundRows = await this.db.query<{ id: string; sale_id: string; sale_status: string; kind: "REFUND" | "VOID"; grand_total_cents: number }>(
      `SELECT r.id, r.original_sale_id AS sale_id, s.status AS sale_status, r.kind, r.grand_total_cents
       FROM refunds r JOIN sales s ON s.id=r.original_sale_id
       WHERE s.created_at>=? AND s.created_at<? AND s.deleted_at IS NULL AND r.status='COMPLETED'
         AND s.status IN ('COMPLETED','PARTIALLY_REFUNDED','REFUNDED','VOIDED')`,
      parameters
    );
    const refunds: ReportRefundRow[] = refundRows.map((row) => ({ id: row.id, saleId: row.sale_id, saleStatus: row.sale_status, kind: row.kind, grandTotalCents: Number(row.grand_total_cents) }));

    const refundPaymentRows = await this.db.query<{
      refund_id: string; sale_id: string; sale_status: string; kind: "REFUND" | "VOID"; method: string; amount_cents: number;
    }>(
      `SELECT rp.refund_id, r.original_sale_id AS sale_id, s.status AS sale_status, r.kind, rp.method, SUM(rp.amount_cents) AS amount_cents
       FROM refund_payments rp JOIN refunds r ON r.id=rp.refund_id JOIN sales s ON s.id=r.original_sale_id
       WHERE s.created_at>=? AND s.created_at<? AND s.deleted_at IS NULL AND r.status='COMPLETED'
         AND s.status IN ('COMPLETED','PARTIALLY_REFUNDED','REFUNDED','VOIDED')
       GROUP BY rp.refund_id, r.original_sale_id, s.status, r.kind, rp.method`,
      parameters
    );
    const refundPayments: ReportRefundPaymentRow[] = refundPaymentRows.map((row) => ({ refundId: row.refund_id, saleId: row.sale_id, saleStatus: row.sale_status, kind: row.kind, method: row.method, amountCents: Number(row.amount_cents) }));

    const source: SalesReportSource = { sales, items, payments, refunds, refundPayments };
    return buildSalesReport(source, range);
  }
}
