import { encodeFunctionData, type Hex } from 'viem';
import { ARC, MARKET, escrowAbi } from '@private-hire/chain';
import {
  inputSchema,
  probeIdSchema,
  hashSchema,
  addressSchema,
  decimalSchema,
} from '@private-hire/domain';
import { z } from 'zod';

export const workSchema = z.object({
  requestId: probeIdSchema,
  jobId: decimalSchema.nullable(),
  manifestHash: hashSchema,
  buyer: addressSchema,
  provider: addressSchema,
  escrow: addressSchema,
  evaluator: addressSchema,
  expiredAt: z.number().int().safe().positive(),
  budget: decimalSchema,
  onchainBudget: decimalSchema.nullable(),
  status: z.number().int().nullable(),
  input: inputSchema,
});

export type Work = z.infer<typeof workSchema>;
export const same = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();

export function nextAction(work: Work, now: bigint, maxBudget: bigint) {
  if (
    !same(work.provider, MARKET.provider) ||
    !same(work.escrow, MARKET.escrow)
  )
    throw new Error('PROVIDER_DESTINATION_MISMATCH');
  if (!work.jobId || now >= BigInt(work.expiredAt)) return 'skip';
  if (BigInt(work.budget) <= 0n || BigInt(work.budget) > maxBudget)
    throw new Error('PROVIDER_BUDGET_LIMIT');
  if (work.status === 0) {
    if (work.onchainBudget === '0') return 'budget';
    if (work.onchainBudget !== work.budget)
      throw new Error('PROVIDER_BUDGET_CONFLICT');
    return 'wait';
  }
  if (work.status === 1) {
    if (work.onchainBudget !== work.budget)
      throw new Error('PROVIDER_BUDGET_CONFLICT');
    return 'submit';
  }
  return 'skip';
}

export function expectedData(
  work: Work,
  action: 'budget' | 'submit',
  resultHash?: Hex,
) {
  if (!work.jobId) throw new Error('PROVIDER_JOB_MISSING');
  if (action === 'budget')
    return encodeFunctionData({
      abi: escrowAbi,
      functionName: 'setBudget',
      args: [BigInt(work.jobId), BigInt(work.budget), '0x'],
    });
  if (!resultHash) throw new Error('PROVIDER_RESULT_MISSING');
  return encodeFunctionData({
    abi: escrowAbi,
    functionName: 'submit',
    args: [BigInt(work.jobId), resultHash, '0x'],
  });
}

export function validatePrepared(raw: unknown, data: Hex) {
  const p = z
    .object({
      chainId: z.literal(ARC.id),
      from: addressSchema,
      to: addressSchema,
      data: z.string(),
      value: z.literal('0'),
    })
    .parse(raw);
  if (
    !same(p.from, MARKET.provider) ||
    !same(p.to, MARKET.escrow) ||
    p.data !== data
  )
    throw new Error('PROVIDER_TRANSACTION_MISMATCH');
}
