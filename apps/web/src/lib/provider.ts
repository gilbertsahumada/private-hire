import { MARKET } from '@private-hire/chain';
import { authorized } from './http';
import { chainClient, same, verifyIdentity } from './catalog';
import { draft, manifest, chainJob, prepareAction, confirmTx } from './jobs';
import { getDelivery } from './job-tasks';
import { MarketError, type MarketEnv } from './market-env';
import type { Hex } from 'viem';

export async function authorizeProvider(request: Request, env: MarketEnv) {
  if (!(await authorized(request, env.PROVIDER_SERVICE_TOKEN ?? '')))
    throw new MarketError('UNAUTHORIZED', 401);
}

export async function providerWork(env: MarketEnv, id: string) {
  const d = await draft(env, id, MARKET.provider);
  if (!same(d.provider, MARKET.provider))
    throw new MarketError('UNAUTHORIZED', 403);
  const m = await manifest(env, d);
  const job = await chainJob(d);
  // Explicit projection: never serialize the full manifest, policy or its nonce.
  return {
    requestId: d.request_id,
    jobId: d.job_id,
    manifestHash: d.manifest_hash,
    buyer: d.buyer,
    provider: d.provider,
    escrow: d.escrow,
    evaluator: d.evaluator,
    expiredAt: d.expired_at,
    budget: d.budget,
    onchainBudget: job?.budget.toString() ?? null,
    status: job?.status ?? null,
    input: m.input,
  };
}

export async function providerAction(
  env: MarketEnv,
  id: string,
  action: 'budget' | 'submit' | 'confirm',
  hash?: Hex,
) {
  const d = await draft(env, id, MARKET.provider);
  if (!same(d.provider, MARKET.provider))
    throw new MarketError('UNAUTHORIZED', 403);
  if (action === 'confirm') {
    if (!hash) throw new MarketError('INVALID_HASH');
    return confirmTx(env, d, MARKET.provider, hash);
  }
  await verifyIdentity(env);
  const job = await chainJob(d);
  const block = await chainClient.getBlock();
  if (!job || block.timestamp >= BigInt(d.expired_at))
    throw new MarketError('JOB_EXPIRED', 409);
  // Never change an already-set budget automatically.
  if (action === 'budget' && job.budget !== 0n)
    throw new MarketError('BUDGET_ALREADY_SET', 409);
  if (BigInt(d.budget) <= 0n) throw new MarketError('INVALID_BUDGET');
  const delivery = action === 'submit' ? await getDelivery(env, d) : undefined;
  return prepareAction(env, d, MARKET.provider, action, delivery?.resultHash);
}
