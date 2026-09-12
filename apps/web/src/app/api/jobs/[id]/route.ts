import { session } from '../../../../lib/auth';
import { draft, jobView } from '../../../../lib/jobs';
import { marketEnv, publicJson, fail } from '../../../../lib/market-env';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const env = marketEnv();
    const wallet = await session(request, env);

    return publicJson(
      await jobView(
        env,
        await draft(env, (await context.params).id, wallet),
        wallet,
      ),
    );
  } catch (e) {
    return fail(e);
  }
}
