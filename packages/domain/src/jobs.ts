import { z } from 'zod';
import { keccak256, toHex } from 'viem';
import {
  canonical,
  inputSchema,
  policySchema,
  probeIdSchema,
} from './portfolio.js';

export const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

export const hashSchema = z.string().regex(/^0x[0-9a-f]{64}$/);

export const decimalSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,77})$/)
  .refine((v) => BigInt(v) < 2n ** 256n);

export const manifestSchema = z.strictObject({
  schemaVersion: z.literal('job-manifest/v1'),
  requestId: probeIdSchema,
  chainId: z.literal('5042002'),
  escrow: addressSchema,
  buyer: addressSchema,
  provider: addressSchema,
  evaluator: addressSchema,
  agentRegistry: z.string(),
  agentId: z.literal('894552'),
  endpoint: z.string().url(),
  a2aVersion: z.literal('1.0'),
  input: inputSchema,
  policy: policySchema,
  budget: decimalSchema.refine((v) => BigInt(v) > 0n),
  token: addressSchema,
  durationMinutes: z.number().int().min(15).max(10080),
  expiredAt: z.number().int().safe().positive(),
  nonce: z.string().regex(/^[a-f0-9]{64}$/),
});

export type JobManifest = z.infer<typeof manifestSchema>;

export const deliverySchema = z.strictObject({
  schemaVersion: z.literal('job-result/v1'),
  chainId: z.literal('5042002'),
  escrow: addressSchema,
  jobId: decimalSchema,
  requestId: probeIdSchema,
  nonce: z.string().regex(/^[a-f0-9]{64}$/),
  result: z.unknown(),
});

export function jobCommitment(domain: 'manifest' | 'result', value: unknown) {
  return keccak256(
    toHex(`confidential-agent-jobs:${domain}:v1\n${canonical(value)}`),
  );
}
