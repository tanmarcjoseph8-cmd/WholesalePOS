export type PriceFields = {
  costPrice: number;
  retailPrice: number;
  wholesalePrice: number;
  vipPrice: number;
};

export type PriceChange = {
  priceType: keyof PriceFields;
  oldPrice: number;
  newPrice: number;
};

export function findPriceChanges(previous: PriceFields, next: Partial<PriceFields>): PriceChange[] {
  return (Object.keys(previous) as Array<keyof PriceFields>).flatMap((priceType) => {
    const nextPrice = next[priceType];
    if (nextPrice === undefined || Number(previous[priceType]) === Number(nextPrice)) {
      return [];
    }

    return [
      {
        priceType,
        oldPrice: Number(previous[priceType]),
        newPrice: Number(nextPrice)
      }
    ];
  });
}
