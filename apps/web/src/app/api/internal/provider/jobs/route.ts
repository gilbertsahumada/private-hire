import { MARKET } from '@private-hire/chain';
import { authorizeProvider } from '../../../../../lib/provider';
import { marketEnv, publicJson, fail } from '../../../../../lib/market-env';

export async function GET(request: Request) {
  try {
    const env = marketEnv();
    await authorizeProvider(request, env);
    const after = new URL(request.url).searchParams.get('after') ?? '';
    const rows = await env.DB.prepare(
      'SELECT request_id FROM market_drafts WHERE provider=? AND job_id IS NOT NULL AND request_id>? ORDER BY request_id LIMIT 50',
    )
      .bind(MARKET.provider.toLowerCase(), after)
      .all<{ request_id: string }>();
    return publicJson({
      requestIds: rows.results.map((r) => r.request_id),
      next: rows.results.length === 50 ? rows.results[49].request_id : null,
    });
  } catch (error) {
    return fail(error);
  }
}
