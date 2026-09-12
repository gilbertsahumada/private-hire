import { session } from '../../../lib/auth';
import { createDraft, chainJob, type Draft } from '../../../lib/jobs';
import {
  fail,
  marketEnv,
  publicJson,
  requireOrigin,
} from '../../../lib/market-env';
import { limitedJson } from '../../../lib/http';

export async function GET(request: Request) {
  try {
    const env = marketEnv();
    const wallet = await session(request, env);
    const provider =
      new URL(request.url).searchParams.get('role') === 'provider';
    const rows = await env.DB.prepare(
      `SELECT * FROM market_drafts WHERE ${provider ? 'provider' : 'buyer'}=? ORDER BY created_at DESC LIMIT 100`,
    )
      .bind(wallet)
      .all<Draft>();

    const jobs = await Promise.all(
      rows.results.map(async (d) => {
        const job = await chainJob(d);

        return {
          ...d,
          chain_status: job?.status ?? null,
          onchainBudget: job?.budget.toString() ?? null,
          refundAvailable:
            !!job &&
            [1, 2].includes(job.status) &&
            Date.now() / 1000 >= d.expired_at,
        };
      }),
    );

    return publicJson({ jobs });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request) {
  try {
    const env = marketEnv();
    requireOrigin(request, env);

    return publicJson(
      await createDraft(
        env,
        await session(request, env),
        await limitedJson(request),
      ),
      201,
    );
  } catch (e) {
    return fail(e);
  }
}
