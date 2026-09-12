import { z } from 'zod';
import { authorized, limitedJson } from '../../../../../lib/http';
import {
  marketEnv,
  publicJson,
  fail,
  MarketError,
} from '../../../../../lib/market-env';
import { reconcile } from '../../../../../lib/reconcile';

export async function POST(request: Request) {
  try {
    const env = marketEnv();
    if (!(await authorized(request, env.JOB_OPERATOR_TOKEN ?? '')))
      throw new MarketError('UNAUTHORIZED', 401);
    const b = z
      .object({
        fromBlock: z
          .string()
          .regex(/^[0-9]+$/)
          .optional(),
      })
      .parse(await limitedJson(request));

    return publicJson(await reconcile(env, b.fromBlock));
  } catch (e) {
    return fail(e);
  }
}
