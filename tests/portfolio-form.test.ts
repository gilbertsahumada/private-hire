import { expect, it } from 'vitest';
import { portfolioPositions } from '../apps/web/src/lib/portfolio-form';

it('converts readable decimal values exactly, without floating point rounding', () => {
  expect(
    portfolioPositions([
      { assetId: 'sample', quantity: '2.50', price: '10.123456' },
    ])[0],
  ).toEqual({
    assetId: 'sample',
    quantityAtomic: '250',
    quantityDecimals: 2,
    unitPriceMicrousd: '10123456',
  });
  expect(
    portfolioPositions([
      {
        assetId: 'sample',
        quantity: '9007199254740993.000000000000000001',
        price: '0.000001',
      },
    ])[0],
  ).toMatchObject({
    quantityAtomic: '9007199254740993000000000000000001',
    quantityDecimals: 18,
    unitPriceMicrousd: '1',
  });
});

it('rejects excess precision and ambiguous input instead of rounding', () => {
  for (const value of [
    '1e3',
    '-1',
    '1,5',
    '.5',
    '01',
    '0.0000000000000000001',
  ]) {
    expect(() =>
      portfolioPositions([{ assetId: 'sample', quantity: value, price: '1' }]),
    ).toThrow();
  }
  expect(() =>
    portfolioPositions([
      { assetId: 'sample', quantity: '1', price: '1.0000001' },
    ]),
  ).toThrow('at most 6');
});

it('enforces the existing 78 digit limit and canonicalizes zero', () => {
  expect(
    portfolioPositions([
      { assetId: 'sample', quantity: '9'.repeat(78), price: '0' },
    ])[0].quantityAtomic,
  ).toHaveLength(78);
  expect(() =>
    portfolioPositions([
      { assetId: 'sample', quantity: '9'.repeat(79), price: '1' },
    ]),
  ).toThrow('too large');
  expect(
    portfolioPositions([
      { assetId: 'sample', quantity: '0.00', price: '0.000000' },
    ])[0],
  ).toMatchObject({ quantityAtomic: '0', unitPriceMicrousd: '0' });
});
