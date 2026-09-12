import { z } from 'zod';
import { authorized, limitedJson } from '../../../../../../lib/http';
import { draft, chainJob } from '../../../../../../lib/jobs';
import {
  marketEnv,
  publicJson,
  fail,
  MarketError,
} from '../../../../../../lib/market-env';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const env = marketEnv();
    if (!(await authorized(request, env.JOB_OPERATOR_TOKEN ?? '')))
      throw new MarketError('UNAUTHORIZED', 401);
    const { id } = await context.params;
    const b = z
      .strictObject({
        attemptId: z.string().uuid(),
        phase: z.enum(['dispatch', 'evaluate']),
        state: z.enum(['running', 'finished', 'pending']),
      })
      .parse(await limitedJson(request));
    const job = await chainJob(await draft(env, id));
    if (b.state !== 'running') {
      const existing = await env.DB.prepare(
        'SELECT id FROM market_attempts WHERE id=? AND request_id=? AND phase=?',
      )
        .bind(b.attemptId, id, b.phase)
        .first();
      if (!existing) throw new MarketError('ATTEMPT_NOT_FOUND', 404);
    }
    if (
      !job ||
      (b.state === 'running' && job.status !== (b.phase === 'dispatch' ? 1 : 2))
    )
      throw new MarketError('JOB_TERMINAL_OR_UNFUNDED', 409);
    await env.DB.prepare(
      'INSERT INTO market_attempts(id,request_id,phase,state,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at WHERE market_attempts.request_id=excluded.request_id AND market_attempts.phase=excluded.phase',
    )
      .bind(b.attemptId, id, b.phase, b.state, Date.now())
      .run();

    return publicJson({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
