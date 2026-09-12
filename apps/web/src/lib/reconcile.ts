import { getDelivery } from './job-tasks';
import { MARKET, escrowAbi } from '@private-hire/chain';
import { chainClient, same } from './catalog';
import { type MarketEnv, MarketError } from './market-env';
import { type Draft, chainJob } from './jobs';

export async function reconcile(env: MarketEnv, fromBlock?: string) {
  const cursor = await env.DB.prepare(
    'SELECT next_block FROM market_scan WHERE id=?',
  )
    .bind(MARKET.escrow)
    .first<{ next_block: string }>();
  if (!cursor && !fromBlock)
    throw new MarketError('INITIAL_FROM_BLOCK_REQUIRED');
  const start = BigInt(cursor?.next_block ?? fromBlock!);
  const latest = await chainClient.getBlockNumber();
  const end = start + 999n < latest ? start + 999n : latest;

  // Recheck recent indexed blocks before advancing; divergent events must not remain displayed.
  const prior = await env.DB.prepare(
    'SELECT DISTINCT block_number,block_hash FROM market_events ORDER BY CAST(block_number AS INTEGER) DESC LIMIT 20',
  ).all<{ block_number: string; block_hash: string }>();
  for (const p of prior.results) {
    const block = await chainClient.getBlock({
      blockNumber: BigInt(p.block_number),
    });
    if (block.hash !== p.block_hash) {
      await env.DB.prepare(
        "UPDATE market_drafts SET job_id=NULL,chain_status=NULL WHERE request_id IN (SELECT request_id FROM market_events WHERE block_number=? AND event_name='JobCreated')",
      )
        .bind(p.block_number)
        .run();
      await env.DB.prepare('DELETE FROM market_events WHERE block_number=?')
        .bind(p.block_number)
        .run();
      await env.DB.prepare('UPDATE market_scan SET next_block=? WHERE id=?')
        .bind(p.block_number, MARKET.escrow)
        .run();
      throw new MarketError('REORG_RESCAN_REQUIRED', 409);
    }
  }
  const logs =
    start > end
      ? []
      : await chainClient.getContractEvents({
          address: MARKET.escrow,
          abi: escrowAbi,
          fromBlock: start,
          toBlock: end,
          strict: true,
        });
  for (const log of logs) {
    const id = log.args.jobId;
    if (id === undefined) continue;
    let d = await env.DB.prepare(
      'SELECT * FROM market_drafts WHERE chain_id=? AND escrow=? AND job_id=?',
    )
      .bind('5042002', MARKET.escrow, id.toString())
      .first<Draft>();
    if (!d && log.eventName === 'JobCreated') {
      const job = await chainClient.readContract({
        address: MARKET.escrow,
        abi: escrowAbi,
        functionName: 'getJob',
        args: [id],
      });
      d = await env.DB.prepare(
        'SELECT * FROM market_drafts WHERE manifest_hash=? AND buyer=? AND job_id IS NULL',
      )
        .bind(job.description, job.client.toLowerCase())
        .first<Draft>();
      if (
        d &&
        same(job.provider, d.provider) &&
        same(job.evaluator, d.evaluator) &&
        job.expiredAt === BigInt(d.expired_at)
      ) {
        await env.DB.prepare(
          'UPDATE market_drafts SET job_id=?,pending_tx=NULL WHERE request_id=? AND job_id IS NULL',
        )
          .bind(id.toString(), d.request_id)
          .run();
        d.job_id = id.toString();
      } else d = null;
    }
    if (!d) continue;
    const job = await chainJob(d);
    await env.DB.prepare(
      'INSERT OR IGNORE INTO market_events(chain_id,tx_hash,log_index,block_hash,block_number,request_id,event_name) VALUES(?,?,?,?,?,?,?)',
    )
      .bind(
        '5042002',
        log.transactionHash,
        log.logIndex,
        log.blockHash,
        log.blockNumber.toString(),
        d.request_id,
        log.eventName,
      )
      .run();
    await env.DB.prepare(
      'UPDATE market_drafts SET chain_status=? WHERE request_id=?',
    )
      .bind(job!.status, d.request_id)
      .run();
  }
  await env.DB.prepare(
    'INSERT INTO market_scan(id,next_block) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET next_block=excluded.next_block',
  )
    .bind(MARKET.escrow, (end + 1n).toString())
    .run();
  const reserved = await env.DB.prepare(
    "SELECT d.* FROM market_drafts d JOIN market_tasks t ON t.request_id=d.request_id WHERE t.state='reserved' LIMIT 100",
  ).all<Draft>();
  for (const row of reserved.results) {
    try {
      await getDelivery(env, row);
    } catch {
      /* Missing or unverifiable objects remain pending. */
    }
  }
  const jobs = await env.DB.prepare(
    'SELECT request_id,job_id,chain_status FROM market_drafts WHERE chain_status IN (1,2) ORDER BY created_at LIMIT 100',
  ).all();

  return {
    nextBlock: (end + 1n).toString(),
    caughtUp: end === latest,
    pending: jobs.results,
  };
}
