import {
  challenge,
  cookie,
  logout,
  session,
  verifyLogin,
} from '../../../../lib/auth';
import {
  fail,
  marketEnv,
  publicJson,
  requireOrigin,
} from '../../../../lib/market-env';
import { limitedJson } from '../../../../lib/http';
import { z } from 'zod';

type Context = { params: Promise<{ action: string }> };

export async function GET(request: Request) {
  try {
    return publicJson({ wallet: await session(request, marketEnv()) });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const env = marketEnv();
    requireOrigin(request, env);
    const { action } = await context.params;
    if (action === 'logout') {
      await logout(request, env);
      const r = publicJson({ ok: true });
      r.headers.set('Set-Cookie', cookie('', 0));

      return r;
    }
    const body = await limitedJson(request);
    if (action === 'nonce')
      return publicJson(
        await challenge(
          env,
          z.object({ wallet: z.string() }).parse(body).wallet,
        ),
      );
    if (action === 'verify') {
      const b = z
        .object({
          nonce: z.string().regex(/^[a-f0-9]{64}$/),
          signature: z.string().max(4096),
        })
        .parse(body);
      const login = await verifyLogin(env, b.nonce, b.signature);
      const r = publicJson({ wallet: login.wallet });
      r.headers.set('Set-Cookie', cookie(login.token));

      return r;
    }

    return publicJson({ error: 'NOT_FOUND' }, 404);
  } catch (e) {
    return fail(e);
  }
}
