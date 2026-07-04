import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import type { Actor } from "../auth/actor.js";
import type { ReportExportQuery, ReportQuery } from "./report.schemas.js";

function toNumber(value: Prisma.Decimal | number | null | undefined) {
  return Number(value ?? 0);
}

function money(value: number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(value);
}

function escapeCsv(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function rangeFor(query: ReportQuery) {
  const now = new Date();
  const start = query.startDate ? new Date(query.startDate) : new Date(now);
  const end = query.endDate ? new Date(query.endDate) : new Date(now);

  if (query.period === "weekly" && !query.startDate) {
    const day = start.getDay();
    start.setDate(start.getDate() - day);
  }
  if (query.period === "monthly" && !query.startDate) {
    start.setDate(1);
  }

  if (query.period !== "custom" || !query.startDate) {
    start.setHours(0, 0, 0, 0);
  }
  if (query.period === "daily" && !query.endDate) {
    end.setHours(23, 59, 59, 999);
  } else if (query.period === "weekly" && !query.endDate) {
    end.setTime(start.getTime());
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
  } else if (query.period === "monthly" && !query.endDate) {
    end.setFullYear(start.getFullYear(), start.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);
  } else {
    end.setHours(23, 59, 59, 999);
  }

  return { start, end };
}

function upsertAggregate<T extends { id: string }>(items: T[], id: string, factory: () => T) {
  let item = items.find((entry) => entry.id === id);
  if (!item) {
    item = factory();
    items.push(item);
  }
  return item;
}

export async function getReportOverview(query: ReportQuery, actor: Actor) {
  const { start, end } = rangeFor(query);
  const where = {
    status: "COMPLETED",
    deletedAt: null,
    createdAt: { gte: start, lte: end },
    ...(actor.storeId ? { storeId: actor.storeId } : {})
  };

  const [sales, inventory] = await prisma.$transaction([
    prisma.sale.findMany({
      where,
      include: {
        cashier: { select: { id: true, name: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, costPrice: true, packageSize: true } }
          }
        },
        payments: true
      },
      orderBy: { createdAt: "asc" }
    }),
    prisma.inventoryStock.findMany({
      where: actor.storeId ? { warehouse: { storeId: actor.storeId } } : {},
      include: {
        product: { select: { id: true, name: true, sku: true, costPrice: true, minimumStock: true, inventoryUnit: true } },
        warehouse: { select: { id: true, name: true } }
      },
      orderBy: [{ product: { name: "asc" } }, { warehouse: { name: "asc" } }]
    })
  ]);

  let grossProfit = 0;
  const bestSellers: Array<{ id: string; sku: string; name: string; quantity: number; revenue: number; profit: number }> = [];
  const cashierSales: Array<{ id: string; name: string; saleCount: number; revenue: number }> = [];
  const paymentSummary: Array<{ id: string; method: string; count: number; amount: number }> = [];

  for (const sale of sales) {
    const cashier = upsertAggregate(cashierSales, sale.cashier.id, () => ({ id: sale.cashier.id, name: sale.cashier.name, saleCount: 0, revenue: 0 }));
    cashier.saleCount += 1;
    cashier.revenue += toNumber(sale.grandTotal);

    for (const item of sale.items) {
      const packageSize = Math.max(toNumber(item.product.packageSize), 0.001);
      const cost = (toNumber(item.product.costPrice) / packageSize) * toNumber(item.baseQuantity);
      const profit = toNumber(item.lineTotal) - cost;
      grossProfit += profit;
      const product = upsertAggregate(bestSellers, item.product.id, () => ({
        id: item.product.id,
        sku: item.product.sku,
        name: item.product.name,
        quantity: 0,
        revenue: 0,
        profit: 0
      }));
      product.quantity += toNumber(item.baseQuantity);
      product.revenue += toNumber(item.lineTotal);
      product.profit += profit;
    }

    for (const payment of sale.payments) {
      const summary = upsertAggregate(paymentSummary, payment.method, () => ({ id: payment.method, method: payment.method, count: 0, amount: 0 }));
      summary.count += 1;
      summary.amount += toNumber(payment.amount);
    }
  }

  const inventoryReport = inventory.map((stock) => {
    const quantity = toNumber(stock.quantity);
    return {
      productId: stock.productId,
      sku: stock.product.sku,
      name: stock.product.name,
      warehouse: stock.warehouse.name,
      quantity,
      unit: stock.product.inventoryUnit,
      value: quantity * toNumber(stock.product.costPrice),
      alert: quantity <= toNumber(stock.product.minimumStock) ? (quantity <= 0 ? "Out of stock" : "Low stock") : "OK"
    };
  });

  const revenue = sales.reduce((sum, sale) => sum + toNumber(sale.grandTotal), 0);

  return {
    period: query.period,
    startDate: start.toISOString(),
    endDate: end.toISOString(),
    summary: {
      salesCount: sales.length,
      revenue,
      grossProfit,
      averageSale: sales.length ? revenue / sales.length : 0,
      inventoryValue: inventoryReport.reduce((sum, item) => sum + item.value, 0),
      lowStockCount: inventoryReport.filter((item) => item.alert !== "OK").length
    },
    bestSellers: bestSellers.sort((left, right) => right.revenue - left.revenue).slice(0, 10),
    cashierSales: cashierSales.sort((left, right) => right.revenue - left.revenue),
    paymentSummary: paymentSummary.sort((left, right) => right.amount - left.amount),
    inventoryReport
  };
}

function buildCsv(report: Awaited<ReturnType<typeof getReportOverview>>) {
  const rows = [
    ["WholesalePOS Report", report.period],
    ["Start", report.startDate],
    ["End", report.endDate],
    [],
    ["Summary"],
    ["Sales Count", report.summary.salesCount],
    ["Revenue", report.summary.revenue],
    ["Gross Profit", report.summary.grossProfit],
    ["Average Sale", report.summary.averageSale],
    ["Inventory Value", report.summary.inventoryValue],
    ["Low Stock Count", report.summary.lowStockCount],
    [],
    ["Best Sellers"],
    ["SKU", "Product", "Quantity", "Revenue", "Profit"],
    ...report.bestSellers.map((item) => [item.sku, item.name, item.quantity, item.revenue, item.profit]),
    [],
    ["Cashier Sales"],
    ["Cashier", "Sales", "Revenue"],
    ...report.cashierSales.map((item) => [item.name, item.saleCount, item.revenue]),
    [],
    ["Payment Summary"],
    ["Method", "Count", "Amount"],
    ...report.paymentSummary.map((item) => [item.method, item.count, item.amount]),
    [],
    ["Inventory"],
    ["SKU", "Product", "Warehouse", "Quantity", "Unit", "Value", "Alert"],
    ...report.inventoryReport.map((item) => [item.sku, item.name, item.warehouse, item.quantity, item.unit, item.value, item.alert])
  ];

  return rows.map((row) => row.map(escapeCsv).join(",")).join("\n");
}

function buildPdfHtml(report: Awaited<ReturnType<typeof getReportOverview>>) {
  const rows = report.bestSellers
    .map((item) => `<tr><td>${item.sku}</td><td>${item.name}</td><td>${item.quantity.toFixed(3)}</td><td>${money(item.revenue)}</td><td>${money(item.profit)}</td></tr>`)
    .join("");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>WholesalePOS Report</title>
<style>
body{font-family:Arial,sans-serif;margin:32px;color:#111} h1{margin:0 0 4px} table{width:100%;border-collapse:collapse;margin-top:18px} th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left} .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px}.metric{border:1px solid #ddd;padding:12px}.metric strong{display:block;font-size:20px;margin-top:4px}
</style></head><body>
<h1>WholesalePOS Report</h1><p>${report.period} | ${new Date(report.startDate).toLocaleDateString("en-PH")} - ${new Date(report.endDate).toLocaleDateString("en-PH")}</p>
<section class="grid">
<div class="metric">Revenue<strong>${money(report.summary.revenue)}</strong></div>
<div class="metric">Gross Profit<strong>${money(report.summary.grossProfit)}</strong></div>
<div class="metric">Sales<strong>${report.summary.salesCount}</strong></div>
</section>
<h2>Best Sellers</h2>
<table><thead><tr><th>SKU</th><th>Product</th><th>Qty</th><th>Revenue</th><th>Profit</th></tr></thead><tbody>${rows}</tbody></table>
</body></html>`;
}

export async function exportReport(query: ReportExportQuery, actor: Actor) {
  const report = await getReportOverview(query, actor);
  if (query.format === "pdf") {
    return {
      format: "pdf",
      mimeType: "text/html",
      fileName: `wholesalepos-report-${report.period}.html`,
      content: buildPdfHtml(report)
    };
  }

  return {
    format: "excel",
    mimeType: "text/csv",
    fileName: `wholesalepos-report-${report.period}.csv`,
    content: buildCsv(report)
  };
}
