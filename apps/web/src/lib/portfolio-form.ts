export type Holding = { assetId: string; quantity: string; price: string };

function decimal(value: string, precision: number, label: string) {
  if (!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value) || value.length > 98)
    throw new Error(
      `${label}: enter a positive number or zero, using a dot for decimals.`,
    );
  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > precision)
    throw new Error(`${label}: use at most ${precision} decimal places.`);

  return { whole, fraction };
}

export function portfolioPositions(holdings: Holding[]) {
  return holdings.map((holding, index) => {
    const quantity = decimal(
      holding.quantity,
      18,
      `Asset ${index + 1} quantity`,
    );
    const price = decimal(holding.price, 6, `Asset ${index + 1} price`);
    const quantityAtomic = BigInt(
      quantity.whole + quantity.fraction,
    ).toString();
    const unitPriceMicrousd = BigInt(
      price.whole + price.fraction.padEnd(6, '0'),
    ).toString();
    if (quantityAtomic.length > 78 || unitPriceMicrousd.length > 78)
      throw new Error(`Asset ${index + 1}: this number is too large.`);

    return {
      assetId: holding.assetId,
      quantityAtomic,
      quantityDecimals: quantity.fraction.length,
      unitPriceMicrousd,
    };
  });
}
