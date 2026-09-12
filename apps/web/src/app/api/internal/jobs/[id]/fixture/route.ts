import { authorized } from '../../../../../../lib/http';
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
    if (
      env.ENABLE_JOB_TEST_FIXTURES !== 'true' ||
      !(await authorized(request, env.JOB_OPERATOR_TOKEN ?? ''))
    )
      throw new MarketError('UNAUTHORIZED', 401);
    const { id } = await context.params;
    const d = await draft(env, id);
    const job = await chainJob(d);
    if (job && job.status > 1) throw new MarketError('WRONG_STATUS', 409);
    if (
      await env.DB.prepare(
        'SELECT task_id FROM market_tasks WHERE request_id=?',
      )
        .bind(id)
        .first()
    )
      throw new MarketError('TASK_ALREADY_RESERVED', 409);
    await env.DB.prepare(
      "INSERT OR IGNORE INTO market_test_fixtures(request_id,fixture) VALUES(?,'plus-one')",
    )
      .bind(id)
      .run();

    return publicJson({ fixture: 'plus-one', requestId: id });
  } catch (e) {
    return fail(e);
  }
}
