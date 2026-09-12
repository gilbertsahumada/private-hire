import { authorized } from '../../../../../../lib/http';
import { draft, manifest, chainJob } from '../../../../../../lib/jobs';
import {
  marketEnv,
  publicJson,
  fail,
  MarketError,
} from '../../../../../../lib/market-env';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const env = marketEnv();
    if (!(await authorized(request, env.JOB_CONTEXT_TOKEN ?? '')))
      throw new MarketError('UNAUTHORIZED', 401);
    const d = await draft(env, (await context.params).id);
    const j = await chainJob(d);

    return publicJson({
      manifest: await manifest(env, d),
      manifestHash: d.manifest_hash,
      jobId: d.job_id,
      chainStatus: j?.status,
    });
  } catch (e) {
    return fail(e);
  }
}
