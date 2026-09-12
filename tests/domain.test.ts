import { describe, it, expect } from 'vitest';
import {
  calculate,
  evaluate,
  inputSchema,
  canonical,
  commitment,
  verifyEnvelope,
  type PortfolioInput,
  type Policy,
} from '../packages/domain/src/index';
const input: PortfolioInput = {
  schemaVersion: 'portfolio-input/v1',
  requestId: 'probe-test',
  positions: [
    {
      assetId: 'a',
      quantityAtomic: '15',
      quantityDecimals: 1,
      unitPriceMicrousd: '3',
    },
    {
      assetId: 'b',
      quantityAtomic: '10',
      quantityDecimals: 1,
      unitPriceMicrousd: '3',
    },
  ],
};
const policy: Policy = {
  schemaVersion: 'portfolio-policy/v1',
  valueToleranceMicrousd: '0',
  weightToleranceBps: 0,
};
describe('independent arithmetic and canonical commitments', () => {
  it('truncates positions before summing and does not adjust weights', () => {
    expect(calculate(input)).toEqual({
      schemaVersion: 'portfolio-result/v1',
      requestId: 'probe-test',
      totalValueMicrousd: '7',
      positions: [
        { assetId: 'a', valueMicrousd: '4', weightBps: 5714 },
        { assetId: 'b', valueMicrousd: '3', weightBps: 4285 },
      ],
      concentrationBps: 5714,
      executionMode: 'deterministic',
    });
  });
  it('uses inclusive private tolerance boundaries', () => {
    const r = calculate(input);
    r.totalValueMicrousd = '8';
    expect(evaluate(input, policy, r)).toBe(2);
    expect(evaluate(input, { ...policy, valueToleranceMicrousd: '1' }, r)).toBe(
      1,
    );
  });
  it('rejects missing, duplicate, extra, invalid and wrong concentration', () => {
    const r = calculate(input);
    expect(evaluate(input, policy, { ...r, concentrationBps: 0 })).toBe(2);
    expect(
      evaluate(input, policy, {
        ...r,
        positions: [r.positions[0], r.positions[0]],
      }),
    ).toBe(2);
    expect(
      evaluate(input, policy, { ...r, positions: r.positions.slice(1) }),
    ).toBe(2);
    expect(evaluate(input, policy, {})).toBe(2);
    expect(
      evaluate(input, policy, { ...r, positions: [...r.positions].reverse() }),
    ).toBe(1);
  });
  it('handles products beyond uint256', () => {
    const r = calculate({
      ...input,
      positions: [
        {
          assetId: 'a',
          quantityAtomic: '1' + '0'.repeat(77),
          unitPriceMicrousd: '1' + '0'.repeat(77),
          quantityDecimals: 0,
        },
      ],
    });
    expect(r.totalValueMicrousd).toBe('1' + '0'.repeat(154));
  });
  it('rejects bad inputs before arithmetic', () => {
    expect(
      inputSchema.safeParse({
        ...input,
        positions: [...input.positions, input.positions[0]],
      }).success,
    ).toBe(false);
    expect(
      inputSchema.safeParse({
        ...input,
        positions: [{ ...input.positions[0], quantityAtomic: '01' }],
      }).success,
    ).toBe(false);
  });
  it('canonicalizes keys and rejects ambiguous JSON', () => {
    expect(canonical({ b: 1, a: '2' })).toBe('{"a":"2","b":1}');
    for (const v of [NaN, undefined, -0, 1.1])
      expect(() => canonical(v)).toThrow();
  });
  it('checks integrity before accepting malformed business data', () => {
    const e = {
      schemaVersion: 'probe-result/v1',
      probeId: 'probe-test',
      requestHash: commitment('input', input),
      nonce: '00'.repeat(32),
      result: {},
    };
    expect(
      verifyEnvelope(e, e.probeId, e.requestHash, commitment('result', e))
        .result,
    ).toEqual({});
    expect(() => verifyEnvelope(e, e.probeId, e.requestHash, '0x00')).toThrow();
  });
});
