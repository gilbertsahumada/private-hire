import {
  calculate,
  canonical,
  deliverySchema,
  inputSchema,
  jobCommitment,
  type PortfolioInput,
} from '@private-hire/domain';
import { keccak256, toHex } from 'viem';
import { nonce, readObject, writeOnce } from './storage';
import { type MarketEnv, MarketError } from './market-env';
import { chainJob, draft, manifest, type Draft } from './jobs';

export async function getDelivery(env: MarketEnv, d: Draft) {
  const row = await env.DB.prepare(
    'SELECT * FROM market_tasks WHERE request_id=?',
  )
    .bind(d.request_id)
    .first<{
      result_key: string;
      result_hash: string | null;
      input_hash: string;
      task_id: string;
    }>();
  if (!row) throw new MarketError('TASK_PENDING', 409);
  const envelope = deliverySchema.parse(
    await readObject(
      env,
      row.result_key,
      `result:${d.provider}:${d.request_id}`,
    ),
  );
  if (
    envelope.requestId !== d.request_id ||
    envelope.jobId !== d.job_id ||
    envelope.escrow.toLowerCase() !== d.escrow.toLowerCase()
  )
    throw new MarketError('INTEGRITY_PENDING', 503);
  const hash = jobCommitment('result', envelope);
  if (row.result_hash && row.result_hash !== hash)
    throw new MarketError('INTEGRITY_PENDING', 503);
  await env.DB.prepare(
    "UPDATE market_tasks SET state='ready',result_hash=? WHERE task_id=?",
  )
    .bind(hash, row.task_id)
    .run();

  return { taskId: row.task_id, envelope, resultHash: hash };
}

export async function runJob(
  env: MarketEnv,
  requestId: string,
  input: PortfolioInput,
  manifestHash: string,
) {
  const d = await draft(env, requestId);
  const job = await chainJob(d);
  if (
    !job ||
    job.status !== 1 ||
    job.budget !== BigInt(d.budget) ||
    Date.now() / 1000 >= d.expired_at ||
    manifestHash !== d.manifest_hash
  )
    throw new MarketError('JOB_NOT_FUNDED', 409);
  input = inputSchema.parse(input);
  if (input.requestId !== requestId) throw new MarketError('CONFLICT', 409);
  const stored = await manifest(env, d);
  if (canonical(stored.input) !== canonical(input))
    throw new MarketError('CONFLICT', 409);
  const inputHash = keccak256(toHex(canonical(input)));
  const key = `jobs/${d.provider}/${requestId}/result.json.enc`;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO market_tasks(task_id,provider,chain_id,escrow,job_id,request_id,manifest_hash,input_hash,result_key,state) VALUES(?,?,?,?,?,?,?,?,?,'reserved')",
  )
    .bind(
      requestId,
      d.provider,
      d.chain_id,
      d.escrow,
      d.job_id,
      requestId,
      manifestHash,
      inputHash,
      key,
    )
    .run();
  const reserved = await env.DB.prepare(
    'SELECT input_hash,manifest_hash FROM market_tasks WHERE task_id=?',
  )
    .bind(requestId)
    .first<{ input_hash: string; manifest_hash: string }>();
  if (
    !reserved ||
    reserved.input_hash !== inputHash ||
    reserved.manifest_hash !== manifestHash
  )
    throw new MarketError('CONFLICT', 409);
  const existing = await readObject(
    env,
    key,
    `result:${d.provider}:${requestId}`,
  );
  if (!existing) {
    await writeOnce(env, key, `result:${d.provider}:${requestId}`, {
      schemaVersion: 'job-result/v1',
      chainId: '5042002',
      escrow: d.escrow,
      jobId: d.job_id,
      requestId,
      nonce: nonce(),
      result: calculate(input),
    });
  }

  return getDelivery(env, d);
}
