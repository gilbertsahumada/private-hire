import { authorized, bindings, errorCode, json } from '../../../../../../lib/http';
import { getContext } from '../../../../../../lib/service';
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const env = bindings();
  if (env.ENABLE_PROBE !== 'true') return json({ error: 'PROBE_DISABLED' }, 404);
  if (!await authorized(request, env.CONTEXT_TOKEN)) return json({ error: 'UNAUTHORIZED' }, 401);
  try { return json(await getContext(env, (await params).id)); } catch (e) { return json({ error: errorCode(e) }, 409); }
}
