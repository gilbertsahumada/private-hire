import { catalog } from '../../../lib/catalog';
import { marketEnv, publicJson, fail } from '../../../lib/market-env';

export async function GET() {
  try {
    return publicJson({ agents: [await catalog(marketEnv())] });
  } catch (e) {
    return fail(e);
  }
}
