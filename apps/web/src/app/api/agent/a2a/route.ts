import {
  rpcSchema,
  sendSchema,
  getSchema,
} from '@private-hire/agent-transport';
import {
  authorized,
  bindings,
  errorCode,
  json,
  limitedJson,
} from '../../../../lib/http';
import { startTask, getTask } from '../../../../lib/service';

export async function POST(request: Request) {
  const env = bindings();
  if (env.ENABLE_PROBE !== 'true')
    return json({ error: 'PROBE_DISABLED' }, 404);
  if (!(await authorized(request, env.A2A_TOKEN)))
    return json({ error: 'UNAUTHORIZED' }, 401);
  if (request.headers.get('a2a-version') !== '1.0')
    return json({ error: 'UNSUPPORTED_VERSION' }, 400);
  let id: string | number | null = null;
  try {
    const raw = await limitedJson(request);
    const parsed = rpcSchema.safeParse(raw);
    if (!parsed.success)
      return json({
        jsonrpc: '2.0',
        id,
        error: { code: -32600, message: 'Invalid Request' },
      });
    const rpc = parsed.data;
    id = rpc.id;
    if (rpc.method === 'SendMessage') {
      const params = sendSchema.safeParse(rpc.params);
      if (!params.success)
        return json({
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: 'Invalid params' },
        });
      const { probeId, input } = params.data.message.parts[0].data;

      return json({
        jsonrpc: '2.0',
        id,
        result: { task: await startTask(env, probeId, input) },
      });
    }
    if (rpc.method === 'GetTask') {
      const params = getSchema.safeParse(rpc.params);
      if (!params.success)
        return json({
          jsonrpc: '2.0',
          id,
          error: { code: -32602, message: 'Invalid params' },
        });

      return json({
        jsonrpc: '2.0',
        id,
        result: await getTask(env, params.data.id),
      });
    }

    return json({
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: 'Method not found' },
    });
  } catch (e) {
    const code = errorCode(e);

    return json({
      jsonrpc: '2.0',
      id,
      error: {
        code:
          code === 'INVALID_JSON'
            ? -32700
            : code === 'TASK_NOT_FOUND'
              ? -32001
              : -32000,
        message: code,
      },
    });
  }
}
