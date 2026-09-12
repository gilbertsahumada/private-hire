import {
  authorized,
  bindings,
  errorCode,
  json,
  limitedJson,
} from '../../../../lib/http';
import { setupProbe } from '../../../../lib/service';
export async function POST(request: Request) {
  const env = bindings();
  if (!(await authorized(request, env.SETUP_TOKEN)))
    return json({ error: 'UNAUTHORIZED' }, 401);
  try {
    return json(await setupProbe(env, await limitedJson(request)));
  } catch (e) {
    return json({ error: errorCode(e) }, 409);
  }
}
