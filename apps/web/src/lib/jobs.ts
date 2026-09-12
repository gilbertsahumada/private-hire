import { z } from 'zod';
import {
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  parseEventLogs,
  type Address,
  type Hex,
  zeroAddress,
} from 'viem';
import { ARC, MARKET, escrowAbi } from '@private-hire/chain';
import {
  inputSchema,
  policySchema,
  manifestSchema,
  jobCommitment,
  probeIdSchema,
  type JobManifest,
} from '@private-hire/domain';
import { nonce, readObject, writeOnce } from './storage';
import { type MarketEnv, MarketError } from './market-env';
import { chainClient, same, verifyIdentity, verifyMarket } from './catalog';

export interface Draft {
  request_id: string;
  buyer: string;
  provider: string;
  manifest_hash: Hex;
  object_key: string;
  budget: string;
  expired_at: number;
  created_at: number;
  chain_id: string;
  escrow: Address;
  evaluator: Address;
  job_id: string | null;
  chain_status: number | null;
  pending_tx: string | null;
}

export const aad = (d: Pick<Draft, 'buyer' | 'request_id'>) =>
  `manifest:${d.buyer}:${d.request_id}`;

export async function draft(env: MarketEnv, id: string, wallet?: string) {
  probeIdSchema.parse(id);
  const d = await env.DB.prepare(
    'SELECT * FROM market_drafts WHERE request_id=?',
  )
    .bind(id)
    .first<Draft>();
  if (!d || (wallet && !same(d.buyer, wallet) && !same(d.provider, wallet)))
    throw new MarketError('JOB_NOT_FOUND', 404);

  return d;
}

export async function manifest(env: MarketEnv, d: Draft): Promise<JobManifest> {
  const m = manifestSchema.parse(await readObject(env, d.object_key, aad(d)));
  if (jobCommitment('manifest', m) !== d.manifest_hash)
    throw new MarketError('INTEGRITY_PENDING', 503);

  return m;
}

export async function createDraft(
  env: MarketEnv,
  wallet: string,
  raw: unknown,
) {
  await verifyMarket(env);
  await verifyIdentity();
  const b = z
    .strictObject({
      requestId: probeIdSchema,
      input: inputSchema,
      policy: policySchema,
      durationMinutes: z.number().int().min(15).max(10080),
    })
    .parse(raw);
  if (b.input.requestId !== b.requestId)
    throw new MarketError('REQUEST_ID_MISMATCH');
  const existing = await env.DB.prepare(
    'SELECT * FROM market_drafts WHERE request_id=?',
  )
    .bind(b.requestId)
    .first<Draft>();
  if (existing) {
    if (!same(existing.buyer, wallet)) throw new MarketError('CONFLICT', 409);
    const m = await manifest(env, existing);
    if (
      JSON.stringify(m.input) !== JSON.stringify(b.input) ||
      JSON.stringify(m.policy) !== JSON.stringify(b.policy) ||
      m.expiredAt - existing.created_at !== b.durationMinutes * 60
    )
      throw new MarketError('CONFLICT', 409);

    return existing;
  }
  const created = Math.floor(Date.now() / 1000);
  const m = manifestSchema.parse({
    schemaVersion: 'job-manifest/v1',
    requestId: b.requestId,
    chainId: '5042002',
    escrow: MARKET.escrow,
    buyer: wallet,
    provider: MARKET.provider.toLowerCase(),
    evaluator: env.JOB_EVALUATOR,
    agentRegistry: `eip155:5042002:${MARKET.registry}`,
    agentId: '894552',
    endpoint: `${MARKET.origin}/api/agent/a2a`,
    a2aVersion: '1.0',
    input: b.input,
    policy: b.policy,
    budget: env.JOB_PRICE_ATOMIC ?? MARKET.fee,
    token: ARC.usdc,
    expiredAt: created + b.durationMinutes * 60,
    nonce: nonce(),
  });
  const object_key = `jobs/${wallet}/${b.requestId}/manifest.json.enc`;
  const saved = manifestSchema.parse(
    await writeOnce(env, object_key, `manifest:${wallet}:${b.requestId}`, m),
  );
  if (
    saved.buyer !== wallet ||
    JSON.stringify(saved.input) !== JSON.stringify(b.input) ||
    JSON.stringify(saved.policy) !== JSON.stringify(b.policy)
  )
    throw new MarketError('CONFLICT', 409);
  // The first immutable manifest wins a concurrent retry, including its nonce and expiry.
  await env.DB.prepare(
    'INSERT OR IGNORE INTO market_drafts(request_id,buyer,provider,manifest_hash,object_key,budget,expired_at,created_at,chain_id,escrow,evaluator) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(
      saved.requestId,
      saved.buyer,
      saved.provider,
      jobCommitment('manifest', saved),
      object_key,
      saved.budget,
      saved.expiredAt,
      saved.expiredAt - b.durationMinutes * 60,
      saved.chainId,
      saved.escrow,
      saved.evaluator,
    )
    .run();

  return draft(env, b.requestId, wallet);
}

export async function chainJob(d: Draft) {
  if (!d.job_id) return null;
  const job = await chainClient.readContract({
    address: d.escrow,
    abi: escrowAbi,
    functionName: 'getJob',
    args: [BigInt(d.job_id)],
  });
  if (
    !same(job.client, d.buyer) ||
    !same(job.provider, d.provider) ||
    !same(job.evaluator, d.evaluator) ||
    job.description !== d.manifest_hash ||
    job.expiredAt !== BigInt(d.expired_at) ||
    job.hook !== zeroAddress
  )
    throw new MarketError('CHAIN_JOB_MISMATCH', 503);

  return job;
}

export async function jobView(env: MarketEnv, d: Draft, wallet: string) {
  const job = await chainJob(d);
  if (job)
    await env.DB.prepare(
      'UPDATE market_drafts SET chain_status=? WHERE request_id=?',
    )
      .bind(job.status, d.request_id)
      .run();
  const task = await env.DB.prepare(
    'SELECT state,result_hash FROM market_tasks WHERE request_id=?',
  )
    .bind(d.request_id)
    .first();
  const events = await env.DB.prepare(
    'SELECT tx_hash,event_name,block_number FROM market_events WHERE request_id=? ORDER BY CAST(block_number AS INTEGER),log_index',
  )
    .bind(d.request_id)
    .all();
  const m = await manifest(env, d);

  return {
    ...d,
    chain_status: job?.status ?? null,
    onchainBudget: job?.budget.toString() ?? null,
    task,
    events: events.results,
    input: m.input,
    ...(same(wallet, d.buyer) ? { policy: m.policy } : {}),
    refundAvailable:
      !!job && [1, 2].includes(job.status) && Date.now() / 1000 >= d.expired_at,
  };
}

export async function prepareAction(
  env: MarketEnv,
  d: Draft,
  wallet: string,
  action: string,
  deliverable?: Hex,
) {
  const job = await chainJob(d);
  const isBuyer = same(wallet, d.buyer),
    isProvider = same(wallet, d.provider);
  const now = Math.floor(Date.now() / 1000);
  let to: Address = d.escrow;
  let data: Hex;
  if (action !== 'refund') {
    await verifyMarket(env);
    if (now >= d.expired_at) throw new MarketError('JOB_EXPIRED');
  }
  if (action === 'create' && isBuyer && !job && !d.pending_tx) {
    await verifyIdentity();
    if (d.expired_at <= now + 300) throw new MarketError('EXPIRY_TOO_CLOSE');
    data = encodeFunctionData({
      abi: escrowAbi,
      functionName: 'createJob',
      args: [
        d.provider as Address,
        d.evaluator,
        BigInt(d.expired_at),
        d.manifest_hash,
        zeroAddress,
      ],
    });
  } else if (action === 'budget' && isProvider && job?.status === 0) {
    data = encodeFunctionData({
      abi: escrowAbi,
      functionName: 'setBudget',
      args: [job.id, BigInt(d.budget), '0x'],
    });
  } else if (
    action === 'approve' &&
    isBuyer &&
    job?.status === 0 &&
    job.budget === BigInt(d.budget)
  ) {
    to = ARC.usdc;
    data = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [d.escrow, BigInt(d.budget)],
    });
  } else if (
    action === 'fund' &&
    isBuyer &&
    job?.status === 0 &&
    job.budget === BigInt(d.budget) &&
    job.budget > 0n
  ) {
    await verifyIdentity();
    data = encodeFunctionData({
      abi: escrowAbi,
      functionName: 'fund',
      args: [job.id, '0x'],
    });
  } else if (
    action === 'submit' &&
    isProvider &&
    job?.status === 1 &&
    job.budget === BigInt(d.budget) &&
    deliverable
  ) {
    data = encodeFunctionData({
      abi: escrowAbi,
      functionName: 'submit',
      args: [job.id, deliverable, '0x'],
    });
  } else if (
    action === 'refund' &&
    isBuyer &&
    job &&
    [1, 2].includes(job.status) &&
    now >= d.expired_at
  ) {
    data = encodeFunctionData({
      abi: escrowAbi,
      functionName: 'claimRefund',
      args: [job.id],
    });
  } else throw new MarketError('ACTION_UNAVAILABLE', 409);
  const gas = await chainClient.estimateGas({
    account: wallet as Address,
    to,
    data,
    value: 0n,
  });
  const gasPrice = await chainClient.getGasPrice();

  return {
    chainId: ARC.id,
    from: wallet,
    to,
    data,
    value: '0',
    estimatedGas: gas.toString(),
    estimatedFeeWei: (gas * gasPrice).toString(),
    action,
  };
}

export async function confirmTx(
  env: MarketEnv,
  d: Draft,
  wallet: string,
  hash: Hex,
) {
  const receipt = await chainClient.getTransactionReceipt({ hash });
  if (receipt.status !== 'success')
    throw new MarketError('TRANSACTION_REVERTED', 409);
  if (!same(receipt.from, wallet))
    throw new MarketError('WRONG_TRANSACTION', 403);
  const tx = await chainClient.getTransaction({ hash });
  if (tx.value !== 0n) throw new MarketError('WRONG_TRANSACTION');
  const block = await chainClient.getBlock({
    blockNumber: receipt.blockNumber,
  });
  if (block.hash !== receipt.blockHash)
    throw new MarketError('REORG_PENDING', 409);
  if (same(receipt.to ?? '', ARC.usdc)) {
    const call = decodeFunctionData({ abi: erc20Abi, data: tx.input });
    if (
      !same(wallet, d.buyer) ||
      call.functionName !== 'approve' ||
      !same(String(call.args[0]), d.escrow) ||
      call.args[1] !== BigInt(d.budget)
    )
      throw new MarketError('WRONG_TRANSACTION');

    return { confirmed: true };
  }
  if (!same(receipt.to ?? '', d.escrow))
    throw new MarketError('WRONG_TRANSACTION');
  const logs = parseEventLogs({
    abi: escrowAbi,
    logs: receipt.logs.filter((l) => same(l.address, d.escrow)),
  });
  if (!logs.length) throw new MarketError('WRONG_TRANSACTION');
  let id = d.job_id;
  for (const log of logs) {
    if (log.eventName === 'JobCreated') {
      const job = await chainClient.readContract({
        address: d.escrow,
        abi: escrowAbi,
        functionName: 'getJob',
        args: [log.args.jobId],
      });
      if (
        !same(job.client, d.buyer) ||
        !same(job.provider, d.provider) ||
        !same(job.evaluator, d.evaluator) ||
        job.description !== d.manifest_hash ||
        job.expiredAt !== BigInt(d.expired_at)
      )
        throw new MarketError('WRONG_TRANSACTION');
      if (id && id !== job.id.toString())
        throw new MarketError('CONFLICT', 409);
      id = job.id.toString();
      await env.DB.prepare(
        'UPDATE market_drafts SET job_id=?,pending_tx=NULL WHERE request_id=? AND (job_id IS NULL OR job_id=?)',
      )
        .bind(id, d.request_id, id)
        .run();
    }
    if (!id || log.args.jobId.toString() !== id)
      throw new MarketError('WRONG_TRANSACTION');
    await env.DB.prepare(
      'INSERT OR IGNORE INTO market_events(chain_id,tx_hash,log_index,block_hash,block_number,request_id,event_name) VALUES(?,?,?,?,?,?,?)',
    )
      .bind(
        '5042002',
        hash,
        log.logIndex,
        receipt.blockHash,
        receipt.blockNumber.toString(),
        d.request_id,
        log.eventName,
      )
      .run();
  }

  return { confirmed: true, jobId: id };
}
