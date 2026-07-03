const currencyFormatters = new Map<string, Intl.NumberFormat>();

export function formatCurrency(amount: number, currency = "PHP", locale = "en-PH") {
  const key = `${locale}:${currency}`;
  const formatter =
    currencyFormatters.get(key) ??
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

  currencyFormatters.set(key, formatter);
  return formatter.format(amount);
}
