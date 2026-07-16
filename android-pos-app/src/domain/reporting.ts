import type { UnitCode } from "./models";

export type ReportPreset = "TODAY" | "THIS_WEEK" | "THIS_MONTH" | "PREVIOUS_DAY" | "PREVIOUS_WEEK" | "PREVIOUS_MONTH" | "CUSTOM";

export type ReportRange = {
  preset: ReportPreset;
  fromDate: string;
  toDate: string;
  startIso: string;
  endExclusiveIso: string;
  timezone: string;
};

export type ReportSaleRow = {
  id: string;
  receiptNumber: string;
  orderNumber: string | null;
  orderType: string;
  customOrderType: string | null;
  tableNumber: string | null;
  status: string;
  subtotalCents: number;
  discountCents: number;
  taxCents: number;
  serviceChargeCents: number;
  tipCents: number;
  grandTotalCents: number;
  createdAt: string;
};

export type ReportItemRow = {
  saleId: string;
  saleStatus: string;
  productId: string;
  sku: string;
  productName: string;
  soldUnit: UnitCode;
  soldQuantityMicro: number;
  lineTotalCents: number;
  refundedQuantityMicro: number;
  refundedLineTotalCents: number;
};

export type ReportPaymentRow = {
  saleId: string;
  saleStatus: string;
  method: string;
  amountCents: number;
};

export type ReportRefundRow = {
  id: string;
  saleId: string;
  saleStatus: string;
  kind: "REFUND" | "VOID";
  grandTotalCents: number;
};

export type ReportRefundPaymentRow = {
  refundId: string;
  saleId: string;
  saleStatus: string;
  kind: "REFUND" | "VOID";
  method: string;
  amountCents: number;
};

export type SalesReportSource = {
  sales: ReportSaleRow[];
  items: ReportItemRow[];
  payments: ReportPaymentRow[];
  refunds: ReportRefundRow[];
  refundPayments: ReportRefundPaymentRow[];
};

const reportableSaleStatuses = new Set(["COMPLETED", "PARTIALLY_REFUNDED", "REFUNDED", "VOIDED"]);

export type SalesReport = {
  range: ReportRange;
  generatedAt: string;
  localDataOnly: true;
  cashDrawer: {
    sessionCount: number;
    openingCashCents: number;
    cashSalesCents: number;
    cashRefundsCents: number;
    cashInCents: number;
    cashOutCents: number;
    expectedCashCents: number;
    actualCashCents: number;
    differenceCents: number;
    openSessionCount: number;
    reviewRequiredCount: number;
    sessions: Array<{ id: string; businessDate: string; cashierName: string; status: string; openingCashCents: number; expectedCashCents: number; actualCashCents: number | null; differenceCents: number | null; openedAt: string; closedAt: string | null }>;
  };
  summary: {
    grossSalesCents: number;
    discountCents: number;
    taxCents: number;
    serviceChargeCents: number;
    tipCents: number;
    refundCents: number;
    voidCents: number;
    netSalesCents: number;
    transactionCount: number;
    averageTransactionCents: number;
    totalItemsSoldMicro: number;
    cashSalesCents: number;
  };
  payments: Array<{ method: string; amountCents: number }>;
  orderTypes: Array<{ orderType: string; transactionCount: number; netSalesCents: number }>;
  bestSellers: Array<{ productId: string; sku: string; name: string; soldUnit: UnitCode; quantityMicro: number; salesCents: number }>;
  highestSalesValue: Array<{ productId: string; sku: string; name: string; soldUnit: UnitCode; quantityMicro: number; salesCents: number }>;
  transactions: Array<{
    id: string;
    receiptNumber: string;
    createdAt: string;
    orderType: string;
    tableNumber: string | null;
    paymentMethods: string[];
    grossCents: number;
    discountCents: number;
    taxCents: number;
    refundCents: number;
    netCents: number;
    status: string;
  }>;
};

type DateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function zonedParts(date: Date, timezone: string): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: read("year"), month: read("month"), day: read("day"), hour: read("hour"), minute: read("minute"), second: read("second") };
}

function dateKeyFromParts(parts: Pick<DateParts, "year" | "month" | "day">) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days)).toISOString().slice(0, 10);
}

function startOfMonth(dateKey: string) {
  return `${dateKey.slice(0, 7)}-01`;
}

function endOfMonth(dateKey: string) {
  const [year, month] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year ?? 0, month ?? 1, 0)).toISOString().slice(0, 10);
}

function zonedMidnightToUtc(dateKey: string, timezone: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const desired = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
  let guess = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = zonedParts(new Date(guess), timezone);
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const difference = desired - represented;
    guess += difference;
    if (difference === 0) break;
  }
  return new Date(guess).toISOString();
}

export function reportRange(
  preset: ReportPreset,
  timezone: string,
  custom: { fromDate: string; toDate: string } | null = null,
  now = new Date()
): ReportRange {
  const currentDate = dateKeyFromParts(zonedParts(now, timezone));
  const currentDay = new Date(`${currentDate}T00:00:00Z`).getUTCDay();
  const daysSinceMonday = (currentDay + 6) % 7;
  let fromDate = currentDate;
  let toDate = currentDate;

  if (preset === "THIS_WEEK") {
    fromDate = shiftDateKey(currentDate, -daysSinceMonday);
    toDate = shiftDateKey(fromDate, 6);
  } else if (preset === "THIS_MONTH") {
    fromDate = startOfMonth(currentDate);
    toDate = endOfMonth(currentDate);
  } else if (preset === "PREVIOUS_DAY") {
    fromDate = shiftDateKey(currentDate, -1);
    toDate = fromDate;
  } else if (preset === "PREVIOUS_WEEK") {
    toDate = shiftDateKey(currentDate, -daysSinceMonday - 1);
    fromDate = shiftDateKey(toDate, -6);
  } else if (preset === "PREVIOUS_MONTH") {
    const previousMonthEnd = shiftDateKey(startOfMonth(currentDate), -1);
    fromDate = startOfMonth(previousMonthEnd);
    toDate = previousMonthEnd;
  } else if (preset === "CUSTOM") {
    if (!custom?.fromDate || !custom.toDate || custom.fromDate > custom.toDate) throw new Error("Choose a valid custom report date range.");
    fromDate = custom.fromDate;
    toDate = custom.toDate;
  }

  return {
    preset,
    fromDate,
    toDate,
    startIso: zonedMidnightToUtc(fromDate, timezone),
    endExclusiveIso: zonedMidnightToUtc(shiftDateKey(toDate, 1), timezone),
    timezone
  };
}

function addAmount(map: Map<string, number>, key: string, amount: number) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

export function buildSalesReport(source: SalesReportSource, range: ReportRange, generatedAt = new Date().toISOString()): SalesReport {
  const reportableSales = source.sales.filter((sale) => reportableSaleStatuses.has(sale.status));
  const reportableIds = new Set(reportableSales.map((sale) => sale.id));
  const includedSales = reportableSales.filter((sale) => sale.status !== "VOIDED");
  const includedIds = new Set(includedSales.map((sale) => sale.id));
  const refundsBySale = new Map<string, number>();
  let refundCents = 0;
  let voidCents = 0;
  for (const refund of source.refunds) {
    if (refund.kind === "VOID" && reportableIds.has(refund.saleId)) {
      voidCents += refund.grandTotalCents;
    } else if (includedIds.has(refund.saleId)) {
      refundCents += refund.grandTotalCents;
      addAmount(refundsBySale, refund.saleId, refund.grandTotalCents);
    }
  }

  const paymentTotals = new Map<string, number>();
  const paymentMethodsBySale = new Map<string, Set<string>>();
  for (const payment of source.payments) {
    const methods = paymentMethodsBySale.get(payment.saleId) ?? new Set<string>();
    methods.add(payment.method);
    paymentMethodsBySale.set(payment.saleId, methods);
    if (!includedIds.has(payment.saleId)) continue;
    addAmount(paymentTotals, payment.method, payment.amountCents);
  }
  for (const payment of source.refundPayments) {
    if (payment.kind !== "REFUND" || !includedIds.has(payment.saleId)) continue;
    addAmount(paymentTotals, payment.method, -payment.amountCents);
  }

  const productTotals = new Map<string, { productId: string; sku: string; name: string; soldUnit: UnitCode; quantityMicro: number; salesCents: number }>();
  for (const item of source.items) {
    if (!includedIds.has(item.saleId)) continue;
    const current = productTotals.get(item.productId) ?? { productId: item.productId, sku: item.sku, name: item.productName, soldUnit: item.soldUnit, quantityMicro: 0, salesCents: 0 };
    current.quantityMicro += Math.max(0, item.soldQuantityMicro - item.refundedQuantityMicro);
    current.salesCents += Math.max(0, item.lineTotalCents - item.refundedLineTotalCents);
    productTotals.set(item.productId, current);
  }

  const orderTypeTotals = new Map<string, { orderType: string; transactionCount: number; netSalesCents: number }>();
  for (const sale of includedSales) {
    const orderType = sale.customOrderType?.trim() || sale.orderType;
    const current = orderTypeTotals.get(orderType) ?? { orderType, transactionCount: 0, netSalesCents: 0 };
    current.transactionCount += 1;
    current.netSalesCents += sale.grandTotalCents - (refundsBySale.get(sale.id) ?? 0);
    orderTypeTotals.set(orderType, current);
  }

  const grossSalesCents = includedSales.reduce((sum, sale) => sum + sale.subtotalCents, 0);
  const discountCents = includedSales.reduce((sum, sale) => sum + sale.discountCents, 0);
  const taxCents = includedSales.reduce((sum, sale) => sum + sale.taxCents, 0);
  const serviceChargeCents = includedSales.reduce((sum, sale) => sum + sale.serviceChargeCents, 0);
  const tipCents = includedSales.reduce((sum, sale) => sum + sale.tipCents, 0);
  const netSalesCents = includedSales.reduce((sum, sale) => sum + sale.grandTotalCents, 0) - refundCents;
  const totalItemsSoldMicro = [...productTotals.values()].reduce((sum, product) => sum + product.quantityMicro, 0);
  const payments = [...paymentTotals.entries()].map(([method, amountCents]) => ({ method, amountCents })).sort((left, right) => right.amountCents - left.amountCents);
  const products = [...productTotals.values()].filter((product) => product.quantityMicro > 0 || product.salesCents > 0);

  return {
    range,
    generatedAt,
    localDataOnly: true,
    cashDrawer: { sessionCount: 0, openingCashCents: 0, cashSalesCents: 0, cashRefundsCents: 0, cashInCents: 0, cashOutCents: 0, expectedCashCents: 0, actualCashCents: 0, differenceCents: 0, openSessionCount: 0, reviewRequiredCount: 0, sessions: [] },
    summary: {
      grossSalesCents,
      discountCents,
      taxCents,
      serviceChargeCents,
      tipCents,
      refundCents,
      voidCents,
      netSalesCents,
      transactionCount: includedSales.length,
      averageTransactionCents: includedSales.length ? Math.round(netSalesCents / includedSales.length) : 0,
      totalItemsSoldMicro,
      cashSalesCents: paymentTotals.get("CASH") ?? 0
    },
    payments,
    orderTypes: [...orderTypeTotals.values()].sort((left, right) => right.netSalesCents - left.netSalesCents),
    bestSellers: [...products].sort((left, right) => right.quantityMicro - left.quantityMicro).slice(0, 20),
    highestSalesValue: [...products].sort((left, right) => right.salesCents - left.salesCents).slice(0, 20),
    transactions: reportableSales.map((sale) => {
      const saleRefundCents = sale.status === "VOIDED"
        ? source.refunds.filter((refund) => refund.saleId === sale.id && refund.kind === "VOID").reduce((sum, refund) => sum + refund.grandTotalCents, 0)
        : refundsBySale.get(sale.id) ?? 0;
      return {
        id: sale.id,
        receiptNumber: sale.receiptNumber,
        createdAt: sale.createdAt,
        orderType: sale.customOrderType?.trim() || sale.orderType,
        tableNumber: sale.tableNumber,
        paymentMethods: [...(paymentMethodsBySale.get(sale.id) ?? new Set<string>())],
        grossCents: sale.subtotalCents,
        discountCents: sale.discountCents,
        taxCents: sale.taxCents,
        refundCents: saleRefundCents,
        netCents: sale.status === "VOIDED" ? 0 : Math.max(0, sale.grandTotalCents - saleRefundCents),
        status: sale.status
      };
    }).sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  };
}

export function reportPresetLabel(preset: ReportPreset) {
  const labels: Record<ReportPreset, string> = {
    TODAY: "Today",
    THIS_WEEK: "This week",
    THIS_MONTH: "This month",
    PREVIOUS_DAY: "Previous day",
    PREVIOUS_WEEK: "Previous week",
    PREVIOUS_MONTH: "Previous month",
    CUSTOM: "Custom range"
  };
  return labels[preset];
}
