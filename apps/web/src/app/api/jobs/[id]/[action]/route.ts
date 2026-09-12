import { z } from 'zod';
import type { Hex } from 'viem';
import { session } from '../../../../../lib/auth';
import { draft, prepareAction, confirmTx } from '../../../../../lib/jobs';
import { getDelivery } from '../../../../../lib/job-tasks';
import {
  marketEnv,
  publicJson,
  fail,
  requireOrigin,
  MarketError,
} from '../../../../../lib/market-env';
import { limitedJson } from '../../../../../lib/http';

type Context = { params: Promise<{ id: string; action: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const env = marketEnv();
    const wallet = await session(request, env);
    const { id, action } = await context.params;
    if (action !== 'result') throw new MarketError('NOT_FOUND', 404);
    const result = await getDelivery(env, await draft(env, id, wallet));

    return publicJson({
      result: result.envelope.result,
      resultHash: result.resultHash,
    });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const env = marketEnv();
    requireOrigin(request, env);
    const wallet = await session(request, env);
    const { id, action } = await context.params;
    const d = await draft(env, id, wallet);
    const body = await limitedJson(request);
    if (action === 'confirm-tx') {
      const b = z
        .object({ hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) })
        .parse(body);

      return publicJson(await confirmTx(env, d, wallet, b.hash as Hex));
    }
    if (action === 'pending-tx') {
      const b = z
        .object({ hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) })
        .parse(body);
      if (wallet !== d.buyer) throw new MarketError('UNAUTHORIZED', 403);
      await env.DB.prepare(
        'UPDATE market_drafts SET pending_tx=? WHERE request_id=? AND job_id IS NULL',
      )
        .bind(b.hash, id)
        .run();

      return publicJson({ ok: true });
    }
    if (action !== 'prepare') throw new MarketError('NOT_FOUND', 404);
    const b = z
      .object({
        action: z.enum([
          'create',
          'budget',
          'approve',
          'fund',
          'submit',
          'refund',
        ]),
      })
      .parse(body);
    const hash =
      b.action === 'submit'
        ? (await getDelivery(env, d)).resultHash
        : undefined;

    return publicJson(await prepareAction(env, d, wallet, b.action, hash));
  } catch (e) {
    return fail(e);
  }
}
