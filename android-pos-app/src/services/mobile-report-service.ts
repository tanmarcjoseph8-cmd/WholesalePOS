import type { LocalDatabase } from "../data/database";
import { reportRange, type ReportPreset, type SalesReport } from "../domain/reporting";
import type { LocalUser, UnitCode } from "../domain/models";
import type { SettingsReportService } from "./settings-report-service";

function requireReportsPermission(actor: LocalUser) {
  if (!actor.permissions.includes("*") && !actor.permissions.includes("reports.view")) throw new Error("Reports permission is required.");
}

const includedStatuses = "('COMPLETED','PARTIALLY_REFUNDED','REFUNDED')";
const reportableStatuses = "('COMPLETED','PARTIALLY_REFUNDED','REFUNDED','VOIDED')";

export class MobileReportService {
  constructor(private db: LocalDatabase, private settings: SettingsReportService) {}

  async getSalesReport(actor: LocalUser, preset: ReportPreset, custom: { fromDate: string; toDate: string } | null = null): Promise<SalesReport> {
    requireReportsPermission(actor);
    const settings = await this.settings.getSettings();
    const range = reportRange(preset, settings.businessTimezone, custom);
    const parameters = [range.startIso, range.endExclusiveIso];

    const [summaryRow] = await this.db.query<{
      gross_sales_cents: number; discount_cents: number; tax_cents: number; service_charge_cents: number;
      tip_cents: number; grand_total_cents: number; transaction_count: number;
    }>(
      `SELECT COALESCE(SUM(s.subtotal_cents),0) AS gross_sales_cents,
              COALESCE(SUM(s.discount_cents),0) AS discount_cents,
              COALESCE(SUM(s.tax_cents),0) AS tax_cents,
              COALESCE(SUM(s.service_charge_cents),0) AS service_charge_cents,
              COALESCE(SUM(s.tip_cents),0) AS tip_cents,
              COALESCE(SUM(s.grand_total_cents),0) AS grand_total_cents,
              COUNT(*) AS transaction_count
       FROM sales s
       WHERE s.created_at>=? AND s.created_at<? AND s.deleted_at IS NULL AND s.status IN ${includedStatuses}`,
      parameters
    );
    const [refundRow] = await this.db.query<{ refund_cents: number; void_cents: number }>(
      `SELECT COALESCE(SUM(CASE WHEN r.kind='REFUND' AND s.status!='VOIDED' THEN r.grand_total_cents ELSE 0 END),0) AS refund_cents,
              COALESCE(SUM(CASE WHEN r.kind='VOID' THEN r.grand_total_cents ELSE 0 END),0) AS void_cents
       FROM refunds r JOIN sales s ON s.id=r.original_sale_id
       WHERE s.created_at>=? AND s.created_at<? AND s.deleted_at IS NULL AND r.status='COMPLETED'
         AND s.status IN ${reportableStatuses}`,
      parameters
    );
    const [itemSummary] = await this.db.query<{ total_items_micro: number }>(
      `SELECT COALESCE(SUM(si.sold_quantity_micro-COALESCE(refunded.quantity_micro,0)),0) AS total_items_micro
       FROM sale_items si JOIN sales s ON s.id=si.sale_id
       LEFT JOIN (
         SELECT ri.sale_item_id, SUM(ri.sold_quantity_micro) AS quantity_micro
         FROM refund_items ri JOIN refunds r ON r.id=ri.refund_id WHERE r.status='COMPLETED' GROUP BY ri.sale_item_id
       ) refunded ON refunded.sale_item_id=si.id
       WHERE s.created_at>=? AND s.created_at<? AND s.deleted_at IS NULL AND s.status IN ${includedStatuses}`,
      parameters
    );

    const paymentRows = await this.db.query<{ method: string; amount_cents: number }>(
      `WITH amounts AS (
         SELECT sp.method,
                SUM(sp.amount_cents)-CASE WHEN sp.method='CASH' THEN s.change_total_cents ELSE 0 END AS amount_cents
         FROM sale_payments sp JOIN sales s ON s.id=sp.sale_id
         WHERE s.created_at>=? AND s.created_at<? AND s.deleted_at IS NULL AND s.status IN ${includedStatuses}
         GROUP BY sp.sale_id, sp.method, s.change_total_cents
         UNION ALL
         SELECT rp.method, -SUM(rp.amount_cents) AS amount_cents
         FROM refund_payments rp JOIN refunds r ON r.id=rp.refund_id JOIN sales s ON s.id=r.original_sale_id
         WHERE s.created_at>=? AND s.created_at<? AND s.deleted_at IS NULL AND r.status='COMPLETED'
           AND r.kind='REFUND' AND s.status IN ${includedStatuses}
         GROUP BY r.id, rp.method
       ) SELECT method, SUM(amount_cents) AS amount_cents FROM amounts GROUP BY method ORDER BY amount_cents DESC`,
      [...parameters, ...parameters]
    );

    const orderTypeRows = await this.db.query<{ order_type: string; transaction_count: number; net_sales_cents: number }>(
      `WITH refund_totals AS (
         SELECT r.original_sale_id AS sale_id, SUM(r.grand_total_cents) AS amount_cents
         FROM refunds r WHERE r.status='COMPLETED' AND r.kind='REFUND' GROUP BY r.original_sale_id
       )
       SELECT COALESCE(NULLIF(TRIM(s.custom_order_type),''),s.order_type) AS order_type,
              COUNT(*) AS transaction_count,
              SUM(s.grand_total_cents-COALESCE(refund_totals.amount_cents,0)) AS net_sales_cents
       FROM sales s LEFT JOIN refund_totals ON refund_totals.sale_id=s.id
       WHERE s.created_at>=? AND s.created_at<? AND s.deleted_at IS NULL AND s.status IN ${includedStatuses}
       GROUP BY COALESCE(NULLIF(TRIM(s.custom_order_type),''),s.order_type) ORDER BY net_sales_cents DESC`,
      parameters
    );

    const productAggregate = `WITH refunded AS (
        SELECT ri.sale_item_id, SUM(ri.sold_quantity_micro) AS quantity_micro, SUM(ri.line_total_cents) AS line_total_cents
        FROM refund_items ri JOIN refunds r ON r.id=ri.refund_id WHERE r.status='COMPLETED' GROUP BY ri.sale_item_id
      )
      SELECT si.product_id, p.sku, p.name, si.sold_unit,
             SUM(si.sold_quantity_micro-COALESCE(refunded.quantity_micro,0)) AS quantity_micro,
             SUM(si.line_total_cents-COALESCE(refunded.line_total_cents,0)) AS sales_cents
      FROM sale_items si JOIN sales s ON s.id=si.sale_id JOIN products p ON p.id=si.product_id
      LEFT JOIN refunded ON refunded.sale_item_id=si.id
      WHERE s.created_at>=? AND s.created_at<? AND s.deleted_at IS NULL AND s.status IN ${includedStatuses}
      GROUP BY si.product_id, p.sku, p.name, si.sold_unit`;
    type ProductAggregateRow = { product_id: string; sku: string; name: string; sold_unit: UnitCode; quantity_micro: number; sales_cents: number };
    const bestSellerRows = await this.db.query<ProductAggregateRow>(`${productAggregate} HAVING quantity_micro>0 OR sales_cents>0 ORDER BY quantity_micro DESC LIMIT 20`, parameters);
    const highestValueRows = await this.db.query<ProductAggregateRow>(`${productAggregate} HAVING quantity_micro>0 OR sales_cents>0 ORDER BY sales_cents DESC LIMIT 20`, parameters);
    const mapProduct = (row: ProductAggregateRow) => ({ productId: row.product_id, sku: row.sku, name: row.name, soldUnit: row.sold_unit, quantityMicro: Number(row.quantity_micro), salesCents: Number(row.sales_cents) });

    const transactionRows = await this.db.query<{
      id: string; receipt_number: string; created_at: string; order_type: string; table_number: string | null;
      payment_methods: string | null; subtotal_cents: number; discount_cents: number; tax_cents: number;
      refund_cents: number; net_cents: number; status: string;
    }>(
      `WITH payment_methods AS (
         SELECT sp.sale_id, GROUP_CONCAT(DISTINCT sp.method) AS methods FROM sale_payments sp GROUP BY sp.sale_id
       ), refund_totals AS (
         SELECT r.original_sale_id AS sale_id,
                SUM(CASE WHEN r.status='COMPLETED' THEN r.grand_total_cents ELSE 0 END) AS amount_cents
         FROM refunds r GROUP BY r.original_sale_id
       )
       SELECT s.id, s.receipt_number, s.created_at,
              COALESCE(NULLIF(TRIM(s.custom_order_type),''),s.order_type) AS order_type, t.number AS table_number,
              payment_methods.methods AS payment_methods, s.subtotal_cents, s.discount_cents, s.tax_cents,
              COALESCE(refund_totals.amount_cents,0) AS refund_cents,
              CASE WHEN s.status='VOIDED' THEN 0 ELSE MAX(0,s.grand_total_cents-COALESCE(refund_totals.amount_cents,0)) END AS net_cents,
              s.status
       FROM sales s LEFT JOIN orders o ON o.id=s.order_id LEFT JOIN restaurant_tables t ON t.id=o.primary_table_id
       LEFT JOIN payment_methods ON payment_methods.sale_id=s.id LEFT JOIN refund_totals ON refund_totals.sale_id=s.id
       WHERE s.created_at>=? AND s.created_at<? AND s.deleted_at IS NULL AND s.status IN ${reportableStatuses}
       ORDER BY s.created_at DESC, s.id DESC LIMIT 500`,
      parameters
    );

    const cashRows = await this.db.query<{
      id: string; business_date: string; cashier_name: string; status: string; opening_cash_cents: number;
      expected_cash_cents: number | null; actual_cash_cents: number | null; difference_cents: number | null; opened_at: string; closed_at: string | null;
      cash_sales_cents: number; cash_refunds_cents: number; cash_in_cents: number; cash_out_cents: number;
    }>(`SELECT cs.id, cs.business_date, u.name AS cashier_name, cs.status, cs.opening_cash_cents, cs.expected_cash_cents,
       cs.actual_cash_cents, cs.difference_cents, cs.opened_at, cs.closed_at,
       COALESCE(SUM(CASE WHEN cm.type='SALE' THEN cm.amount_cents ELSE 0 END),0) AS cash_sales_cents,
       COALESCE(SUM(CASE WHEN cm.type='REFUND' THEN cm.amount_cents ELSE 0 END),0) AS cash_refunds_cents,
       COALESCE(SUM(CASE WHEN cm.type IN ('CASH_IN','CORRECTION_IN') THEN cm.amount_cents ELSE 0 END),0) AS cash_in_cents,
       COALESCE(SUM(CASE WHEN cm.type IN ('CASH_OUT','CORRECTION_OUT') THEN cm.amount_cents ELSE 0 END),0) AS cash_out_cents
       FROM cash_sessions cs JOIN users u ON u.id=cs.opened_by_user_id LEFT JOIN cash_movements cm ON cm.cash_session_id=cs.id
       WHERE cs.business_date>=? AND cs.business_date<=? GROUP BY cs.id, u.name ORDER BY cs.opened_at DESC`, [range.fromDate, range.toDate]);

    const grossSalesCents = Number(summaryRow?.gross_sales_cents ?? 0);
    const refundCents = Number(refundRow?.refund_cents ?? 0);
    const transactionCount = Number(summaryRow?.transaction_count ?? 0);
    const netSalesCents = Number(summaryRow?.grand_total_cents ?? 0) - refundCents;
    const payments = paymentRows.map((row) => ({ method: row.method, amountCents: Number(row.amount_cents) }));
    const sessions = cashRows.map((row) => ({
      id: row.id, businessDate: row.business_date, cashierName: row.cashier_name, status: row.status,
      openingCashCents: Number(row.opening_cash_cents),
      expectedCashCents: row.expected_cash_cents === null ? Number(row.opening_cash_cents) + Number(row.cash_sales_cents) - Number(row.cash_refunds_cents) + Number(row.cash_in_cents) - Number(row.cash_out_cents) : Number(row.expected_cash_cents),
      actualCashCents: row.actual_cash_cents === null ? null : Number(row.actual_cash_cents),
      differenceCents: row.difference_cents === null ? null : Number(row.difference_cents), openedAt: row.opened_at, closedAt: row.closed_at
    }));

    return {
      range,
      generatedAt: new Date().toISOString(),
      localDataOnly: true,
      summary: {
        grossSalesCents,
        discountCents: Number(summaryRow?.discount_cents ?? 0),
        taxCents: Number(summaryRow?.tax_cents ?? 0),
        serviceChargeCents: Number(summaryRow?.service_charge_cents ?? 0),
        tipCents: Number(summaryRow?.tip_cents ?? 0),
        refundCents,
        voidCents: Number(refundRow?.void_cents ?? 0),
        netSalesCents,
        transactionCount,
        averageTransactionCents: transactionCount ? Math.round(netSalesCents / transactionCount) : 0,
        totalItemsSoldMicro: Number(itemSummary?.total_items_micro ?? 0),
        cashSalesCents: payments.find((payment) => payment.method === "CASH")?.amountCents ?? 0
      },
      payments,
      orderTypes: orderTypeRows.map((row) => ({ orderType: row.order_type, transactionCount: Number(row.transaction_count), netSalesCents: Number(row.net_sales_cents) })),
      bestSellers: bestSellerRows.map(mapProduct),
      highestSalesValue: highestValueRows.map(mapProduct),
      transactions: transactionRows.map((row) => ({
        id: row.id, receiptNumber: row.receipt_number, createdAt: row.created_at, orderType: row.order_type,
        tableNumber: row.table_number, paymentMethods: row.payment_methods?.split(",").filter(Boolean) ?? [],
        grossCents: Number(row.subtotal_cents), discountCents: Number(row.discount_cents), taxCents: Number(row.tax_cents),
        refundCents: Number(row.refund_cents), netCents: Number(row.net_cents), status: row.status
      })),
      cashDrawer: {
        sessionCount: sessions.length,
        openingCashCents: cashRows.reduce((sum, row) => sum + Number(row.opening_cash_cents), 0),
        cashSalesCents: cashRows.reduce((sum, row) => sum + Number(row.cash_sales_cents), 0),
        cashRefundsCents: cashRows.reduce((sum, row) => sum + Number(row.cash_refunds_cents), 0),
        cashInCents: cashRows.reduce((sum, row) => sum + Number(row.cash_in_cents), 0),
        cashOutCents: cashRows.reduce((sum, row) => sum + Number(row.cash_out_cents), 0),
        expectedCashCents: sessions.reduce((sum, row) => sum + row.expectedCashCents, 0),
        actualCashCents: sessions.reduce((sum, row) => sum + (row.actualCashCents ?? 0), 0),
        differenceCents: sessions.reduce((sum, row) => sum + (row.differenceCents ?? 0), 0),
        openSessionCount: cashRows.filter((row) => row.status === "OPEN").length,
        reviewRequiredCount: cashRows.filter((row) => row.status === "REVIEW_REQUIRED").length,
        sessions
      }
    };
  }
}
