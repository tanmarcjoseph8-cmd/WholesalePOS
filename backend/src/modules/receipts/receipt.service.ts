import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/prisma.js";
import { AppError } from "../../shared/app-error.js";
import type { Actor } from "../auth/actor.js";
import type { ReceiptPaperWidth, ReceiptPrintInput } from "./receipt.schemas.js";

type ReceiptSale = Prisma.SaleGetPayload<{
  include: {
    store: true;
    cashier: { select: { id: true; name: true; email: true } };
    customer: { select: { id: true; name: true; phone: true } };
    items: { include: { product: { select: { id: true; name: true; sku: true } } } };
    payments: true;
  };
}>;

function toNumber(value: Prisma.Decimal | number) {
  return Number(value);
}

function money(value: Prisma.Decimal | number) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(toNumber(value));
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function paperColumns(paperWidth: ReceiptPaperWidth) {
  return paperWidth === "58mm" ? 32 : 42;
}

function line(label: string, value: string, columns: number) {
  const cleanLabel = label.slice(0, Math.max(1, columns - value.length - 1));
  return `${cleanLabel}${" ".repeat(Math.max(1, columns - cleanLabel.length - value.length))}${value}`;
}

function center(value: string, columns: number) {
  const cleanValue = value.slice(0, columns);
  return `${" ".repeat(Math.floor(Math.max(0, columns - cleanValue.length) / 2))}${cleanValue}`;
}

function barcodeSvg(data: string) {
  let cursor = 0;
  const bars = [...data].flatMap((character, index) => {
    const code = character.charCodeAt(0) + index * 17;
    return Array.from({ length: 7 }, (_item, bit) => ((code >> bit) & 1 ? 3 : 1));
  });
  const rects = bars
    .map((width, index) => {
      const x = cursor;
      cursor += width;
      return index % 2 === 0 ? `<rect x="${x}" y="0" width="${width}" height="48"/>` : "";
    })
    .join("");
  const safeData = escapeHtml(data);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${cursor}" height="68" viewBox="0 0 ${cursor} 68" role="img" aria-label="Receipt barcode ${safeData}"><g fill="#111">${rects}</g><text x="${cursor / 2}" y="64" text-anchor="middle" font-family="monospace" font-size="10">${safeData}</text></svg>`;
}

function receiptText(sale: ReceiptSale, paperWidth: ReceiptPaperWidth) {
  const columns = paperColumns(paperWidth);
  const rows = [
    center(sale.store.name, columns),
    sale.store.address ? center(sale.store.address, columns) : null,
    sale.store.phone ? center(sale.store.phone, columns) : null,
    "-".repeat(columns),
    line("Receipt", sale.receiptNumber, columns),
    line("Date", new Date(sale.createdAt).toLocaleString("en-PH"), columns),
    line("Cashier", sale.cashier.name, columns),
    sale.customer ? line("Customer", sale.customer.name, columns) : null,
    "-".repeat(columns),
    ...sale.items.flatMap((item) => {
      const quantity = `${toNumber(item.soldQuantity).toLocaleString("en-PH", { maximumFractionDigits: 3 })} ${item.soldUnit.toLowerCase()}`;
      return [
        item.product.name.slice(0, columns),
        line(`${quantity} x ${money(item.unitPrice)}`, money(item.lineTotal), columns)
      ];
    }),
    "-".repeat(columns),
    line("Subtotal", money(sale.subtotal), columns),
    line("Discount", money(sale.discountTotal), columns),
    line("Tax", money(sale.taxTotal), columns),
    line("TOTAL", money(sale.grandTotal), columns),
    line("Paid", money(sale.paidTotal), columns),
    line("Change", money(sale.changeTotal), columns),
    "-".repeat(columns),
    ...sale.payments.map((payment) => line(payment.method, money(payment.amount), columns)),
    "-".repeat(columns),
    center(sale.receiptNumber, columns),
    center("Thank you", columns)
  ];

  return rows.filter((row): row is string => Boolean(row)).join("\n");
}

function receiptHtml(sale: ReceiptSale, paperWidth: ReceiptPaperWidth, barcode: string) {
  const width = paperWidth === "58mm" ? "58mm" : "80mm";
  const items = sale.items
    .map(
      (item) => `<tr>
        <td>
          <strong>${escapeHtml(item.product.name)}</strong>
          <span>${toNumber(item.soldQuantity).toLocaleString("en-PH", { maximumFractionDigits: 3 })} ${escapeHtml(item.soldUnit.toLowerCase())} x ${money(item.unitPrice)}</span>
        </td>
        <td>${money(item.lineTotal)}</td>
      </tr>`
    )
    .join("");
  const payments = sale.payments.map((payment) => `<div><span>${escapeHtml(payment.method)}</span><strong>${money(payment.amount)}</strong></div>`).join("");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(sale.receiptNumber)}</title>
  <style>
    @page { size: ${width} auto; margin: 4mm; }
    body { margin: 0; background: #fff; color: #111; font-family: Arial, sans-serif; font-size: 11px; }
    main { width: ${width}; }
    h1, p { margin: 0; text-align: center; }
    h1 { font-size: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    td { padding: 3px 0; vertical-align: top; }
    td:last-child { text-align: right; white-space: nowrap; }
    td span { display: block; font-size: 10px; color: #444; }
    .rule { border-top: 1px dashed #111; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; margin: 3px 0; }
    .total { font-size: 14px; font-weight: 700; }
    .barcode { display: flex; justify-content: center; margin-top: 8px; overflow: hidden; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(sale.store.name)}</h1>
    ${sale.store.address ? `<p>${escapeHtml(sale.store.address)}</p>` : ""}
    ${sale.store.phone ? `<p>${escapeHtml(sale.store.phone)}</p>` : ""}
    <div class="rule"></div>
    <div class="row"><span>Receipt</span><strong>${escapeHtml(sale.receiptNumber)}</strong></div>
    <div class="row"><span>Date</span><strong>${escapeHtml(new Date(sale.createdAt).toLocaleString("en-PH"))}</strong></div>
    <div class="row"><span>Cashier</span><strong>${escapeHtml(sale.cashier.name)}</strong></div>
    ${sale.customer ? `<div class="row"><span>Customer</span><strong>${escapeHtml(sale.customer.name)}</strong></div>` : ""}
    <div class="rule"></div>
    <table>${items}</table>
    <div class="rule"></div>
    <div class="row"><span>Subtotal</span><strong>${money(sale.subtotal)}</strong></div>
    <div class="row"><span>Discount</span><strong>${money(sale.discountTotal)}</strong></div>
    <div class="row"><span>Tax</span><strong>${money(sale.taxTotal)}</strong></div>
    <div class="row total"><span>Total</span><strong>${money(sale.grandTotal)}</strong></div>
    <div class="row"><span>Paid</span><strong>${money(sale.paidTotal)}</strong></div>
    <div class="row"><span>Change</span><strong>${money(sale.changeTotal)}</strong></div>
    <div class="rule"></div>
    ${payments}
    <div class="barcode">${barcode}</div>
    <p>Thank you</p>
  </main>
</body>
</html>`;
}

function escPosBase64(text: string) {
  const bytes = Buffer.concat([
    Buffer.from([0x1b, 0x40, 0x1b, 0x61, 0x01]),
    Buffer.from(`${text}\n\n\n`, "utf8"),
    Buffer.from([0x1d, 0x56, 0x00])
  ]);
  return bytes.toString("base64");
}

async function getSaleForReceipt(saleId: string, actor: Actor) {
  const sale = await prisma.sale.findFirst({
    where: {
      id: saleId,
      deletedAt: null,
      ...(actor.storeId ? { storeId: actor.storeId } : {})
    },
    include: {
      store: true,
      cashier: { select: { id: true, name: true, email: true } },
      customer: { select: { id: true, name: true, phone: true } },
      items: { include: { product: { select: { id: true, name: true, sku: true } } }, orderBy: { id: "asc" } },
      payments: { orderBy: { createdAt: "asc" } }
    }
  });

  if (!sale) {
    throw new AppError(404, "SALE_NOT_FOUND", "Sale receipt was not found.");
  }

  return sale;
}

export async function getSaleReceipt(saleId: string, actor: Actor, paperWidth: ReceiptPaperWidth) {
  const sale = await getSaleForReceipt(saleId, actor);
  const barcodeData = sale.receiptNumber;
  const barcode = barcodeSvg(barcodeData);
  const text = receiptText(sale, paperWidth);

  return {
    saleId: sale.id,
    receiptNumber: sale.receiptNumber,
    paperWidth,
    barcodeData,
    barcodeSvg: barcode,
    text,
    html: receiptHtml(sale, paperWidth, barcode),
    escPosBase64: escPosBase64(text)
  };
}

export async function requestReceiptPrint(saleId: string, actor: Actor, input: ReceiptPrintInput) {
  const receipt = await getSaleReceipt(saleId, actor, input.paperWidth);
  const printLog = await prisma.receiptPrintLog.create({
    data: {
      saleId,
      printedById: actor.userId,
      printerName: input.printerName ?? null,
      printerType: input.printerType,
      paperWidth: input.paperWidth,
      status: "REQUESTED"
    }
  });

  await prisma.auditLog.create({
    data: {
      actorId: actor.userId,
      action: "RECEIPT_PRINT_REQUESTED",
      entityType: "Sale",
      entityId: saleId,
      metadata: {
        receiptNumber: receipt.receiptNumber,
        printerType: input.printerType,
        printerName: input.printerName ?? null,
        paperWidth: input.paperWidth
      }
    }
  });

  return { printLogId: printLog.id, ...receipt };
}
