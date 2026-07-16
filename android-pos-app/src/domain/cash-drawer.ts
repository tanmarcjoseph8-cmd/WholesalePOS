export type CashSessionStatus = "OPEN" | "CLOSED" | "REVIEW_REQUIRED" | "REVIEWED";
export type CashMovementType = "SALE" | "REFUND" | "CASH_IN" | "CASH_OUT" | "CORRECTION_IN" | "CORRECTION_OUT";

export type DenominationCount = {
  key: string;
  label: string;
  valueCents: number;
  quantity: number;
};

export const phpDenominations: ReadonlyArray<Omit<DenominationCount, "quantity">> = [
  { key: "bill_1000", label: "PHP 1,000 bill", valueCents: 100_000 },
  { key: "bill_500", label: "PHP 500 bill", valueCents: 50_000 },
  { key: "bill_200", label: "PHP 200 bill", valueCents: 20_000 },
  { key: "bill_100", label: "PHP 100 bill", valueCents: 10_000 },
  { key: "bill_50", label: "PHP 50 bill", valueCents: 5_000 },
  { key: "bill_20", label: "PHP 20 bill", valueCents: 2_000 },
  { key: "coin_20", label: "PHP 20 coin", valueCents: 2_000 },
  { key: "coin_10", label: "PHP 10 coin", valueCents: 1_000 },
  { key: "coin_5", label: "PHP 5 coin", valueCents: 500 },
  { key: "coin_1", label: "PHP 1 coin", valueCents: 100 },
  { key: "coin_025", label: "PHP 0.25 coin", valueCents: 25 }
];

export type CashMovementRecord = {
  id: string;
  type: CashMovementType;
  direction: -1 | 1;
  amountCents: number;
  reason: string;
  notes: string | null;
  relatedType: string | null;
  relatedId: string | null;
  createdByName: string;
  createdAt: string;
  reversedAt: string | null;
};

export type CashSessionRecord = {
  id: string;
  registerId: string;
  businessDate: string;
  openedByUserId: string;
  openedByName: string;
  closedByName: string | null;
  status: CashSessionStatus;
  openingCashCents: number;
  cashSalesCents: number;
  cashRefundsCents: number;
  cashInCents: number;
  cashOutCents: number;
  correctionsCents: number;
  expectedCashCents: number;
  actualCashCents: number | null;
  differenceCents: number | null;
  openingNotes: string | null;
  closingNotes: string | null;
  denominationCounts: DenominationCount[];
  reviewNotes: string | null;
  reviewResolution: string | null;
  openedAt: string;
  closedAt: string | null;
  reviewedAt: string | null;
  movements: CashMovementRecord[];
};

export function denominationTotal(counts: DenominationCount[]) {
  return counts.reduce((sum, item) => sum + item.valueCents * Math.max(0, Math.trunc(item.quantity)), 0);
}

export function expectedCash(input: {
  openingCashCents: number;
  cashSalesCents: number;
  cashRefundsCents: number;
  cashInCents: number;
  cashOutCents: number;
  correctionsCents?: number;
}) {
  return input.openingCashCents + input.cashSalesCents - input.cashRefundsCents + input.cashInCents - input.cashOutCents + (input.correctionsCents ?? 0);
}

export function netCashReceived(cashTenderedCents: number, changeCents: number) {
  return Math.max(0, Math.trunc(cashTenderedCents) - Math.max(0, Math.trunc(changeCents)));
}
