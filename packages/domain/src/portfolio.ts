import { z } from 'zod';
import { keccak256, toHex, type Hex } from 'viem';

export const PROJECT_NAME = 'Confidential Agent Jobs';

export const probeIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

const integer = (digits: number) =>
  z.string().regex(new RegExp(`^(0|[1-9][0-9]{0,${digits - 1}})$`));

const asset = z.string().min(1).max(128);

export const inputSchema = z
  .strictObject({
    schemaVersion: z.literal('portfolio-input/v1'),
    requestId: probeIdSchema,
    positions: z
      .array(
        z.strictObject({
          assetId: asset,
          quantityAtomic: integer(78),
          quantityDecimals: z.number().int().min(0).max(18),
          unitPriceMicrousd: integer(78),
        }),
      )
      .min(1)
      .max(10),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.positions.map((p) => p.assetId)).size !== v.positions.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate asset' });
    if (
      v.positions.reduce(
        (sum, p) =>
          sum +
          (BigInt(p.quantityAtomic) * BigInt(p.unitPriceMicrousd)) /
            10n ** BigInt(p.quantityDecimals),
        0n,
      ) === 0n
    )
      ctx.addIssue({ code: 'custom', message: 'Zero total' });
  });

export const policySchema = z.strictObject({
  schemaVersion: z.literal('portfolio-policy/v1'),
  valueToleranceMicrousd: integer(78),
  weightToleranceBps: z.number().int().min(0).max(10000),
});

export const resultSchema = z.strictObject({
  schemaVersion: z.literal('portfolio-result/v1'),
  requestId: probeIdSchema,
  totalValueMicrousd: integer(157),
  positions: z
    .array(
      z.strictObject({
        assetId: asset,
        valueMicrousd: integer(156),
        weightBps: z.number().int().min(0).max(10000),
      }),
    )
    .min(1)
    .max(10),
  concentrationBps: z.number().int().min(0).max(10000),
  executionMode: z.literal('deterministic'),
});

export type PortfolioInput = z.infer<typeof inputSchema>;

export type Policy = z.infer<typeof policySchema>;

export type PortfolioResult = z.infer<typeof resultSchema>;

export const envelopeSchema = z.strictObject({
  schemaVersion: z.literal('probe-result/v1'),
  probeId: probeIdSchema,
  requestHash: z.string().regex(/^0x[0-9a-f]{64}$/),
  nonce: z.string().regex(/^[0-9a-f]{64}$/),
  result: z.unknown(),
});

export type Envelope = z.infer<typeof envelopeSchema>;

export const contextSchema = z.strictObject({
  probeId: probeIdSchema,
  input: inputSchema,
  policy: policySchema,
  validUntil: z.number().int().positive(),
  inputHash: z.string().regex(/^0x[0-9a-f]{64}$/),
});

export type ProbeContext = z.infer<typeof contextSchema>;

export function calculate(input: PortfolioInput): PortfolioResult {
  const parsed = inputSchema.parse(input);
  const values = parsed.positions.map(
    (p) =>
      (BigInt(p.quantityAtomic) * BigInt(p.unitPriceMicrousd)) /
      10n ** BigInt(p.quantityDecimals),
  );
  const total = values.reduce((a, b) => a + b, 0n);
  const positions = parsed.positions.map((p, i) => ({
    assetId: p.assetId,
    valueMicrousd: values[i].toString(),
    weightBps: Number((values[i] * 10000n) / total),
  }));

  return {
    schemaVersion: 'portfolio-result/v1',
    requestId: parsed.requestId,
    totalValueMicrousd: total.toString(),
    positions,
    concentrationBps: Math.max(...positions.map((p) => p.weightBps)),
    executionMode: 'deterministic',
  };
}

export function evaluate(
  input: PortfolioInput,
  policy: Policy,
  received: unknown,
): 1 | 2 {
  const expected = calculate(input);
  policy = policySchema.parse(policy);
  const parsed = resultSchema.safeParse(received);
  if (!parsed.success) return 2;
  const result = parsed.data;
  if (
    result.requestId !== input.requestId ||
    result.positions.length !== expected.positions.length ||
    new Set(result.positions.map((p) => p.assetId)).size !==
      result.positions.length
  )
    return 2;

  const within = (a: string, b: string) => {
    const d = BigInt(a) - BigInt(b);

    return (d < 0n ? -d : d) <= BigInt(policy.valueToleranceMicrousd);
  };

  if (
    !within(result.totalValueMicrousd, expected.totalValueMicrousd) ||
    Math.abs(result.concentrationBps - expected.concentrationBps) >
      policy.weightToleranceBps
  )
    return 2;
  for (const p of expected.positions) {
    const r = result.positions.find((q) => q.assetId === p.assetId);
    if (
      !r ||
      !within(r.valueMicrousd, p.valueMicrousd) ||
      Math.abs(r.weightBps - p.weightBps) > policy.weightToleranceBps
    )
      return 2;
  }

  return 1;
}

// Deliberately small JSON canonicalizer: lexical object keys; arrays retain their order.
export function canonical(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    !Object.is(value, -0)
  )
    return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ':' +
            canonical((value as Record<string, unknown>)[k]),
        )
        .join(',') +
      '}'
    );
  throw new Error('NON_CANONICAL_JSON');
}

export function commitment(
  domain: 'input' | 'result' | 'context',
  value: unknown,
): Hex {
  return keccak256(
    toHex(`confidential-agent-jobs:probe:${domain}:v1\n${canonical(value)}`),
  );
}

export function probeKey(id: string): Hex {
  return keccak256(toHex(probeIdSchema.parse(id)));
}

export function verifyEnvelope(
  raw: unknown,
  probeId: string,
  inputHash: string,
  hash: string,
): Envelope {
  const e = envelopeSchema.parse(raw);
  if (
    e.probeId !== probeId ||
    e.requestHash !== inputHash ||
    commitment('result', e) !== hash
  )
    throw new Error('INTEGRITY_PENDING');

  return e;
}
