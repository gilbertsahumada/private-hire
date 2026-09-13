import { z } from 'zod';
import type { Hex } from 'viem';
import {
  authorizeProvider,
  providerWork,
  providerAction,
} from '../../../../../../../lib/provider';
import {
  marketEnv,
  publicJson,
  fail,
  MarketError,
} from '../../../../../../../lib/market-env';
import { limitedJson } from '../../../../../../../lib/http';

type Context = { params: Promise<{ id: string; action: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const env = marketEnv();
    await authorizeProvider(request, env);
    const { id, action } = await context.params;
    if (action !== 'work') throw new MarketError('NOT_FOUND', 404);
    return publicJson(await providerWork(env, id));
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const env = marketEnv();
    await authorizeProvider(request, env);
    const { id, action } = await context.params;
    const allowed = z.enum(['budget', 'submit', 'confirm']).parse(action);
    const body = await limitedJson(request);
    const hash =
      allowed === 'confirm'
        ? (z
            .object({ hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/) })
            .parse(body).hash as Hex)
        : undefined;
    return publicJson(await providerAction(env, id, allowed, hash));
  } catch (error) {
    return fail(error);
  }
}
