import { jobSendSchema } from '@private-hire/agent-transport';
import { marketEnv } from '../../../../lib/market-env';
import { runJob, getDelivery } from '../../../../lib/job-tasks';
import { draft } from '../../../../lib/jobs';
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
      const jobParams = jobSendSchema.safeParse(rpc.params);
      if (jobParams.success) {
        const { requestId, manifestHash, input } =
          jobParams.data.message.parts[0].data;
        const result = await runJob(
          marketEnv(),
          requestId,
          input,
          manifestHash,
        );

        return json({
          jsonrpc: '2.0',
          id,
          result: { task: asTask(requestId, result) },
        });
      }
      if (env.ENABLE_PROBE !== 'true')
        return json({ error: 'PROBE_DISABLED' }, 404);
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

      const job = await marketEnv()
        .DB.prepare('SELECT request_id FROM market_tasks WHERE task_id=?')
        .bind(params.data.id)
        .first<{ request_id: string }>();
      if (job)
        return json({
          jsonrpc: '2.0',
          id,
          result: asTask(
            params.data.id,
            await getDelivery(
              marketEnv(),
              await draft(marketEnv(), job.request_id),
            ),
          ),
        });
      if (env.ENABLE_PROBE !== 'true')
        return json({ error: 'PROBE_DISABLED' }, 404);

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

function asTask(id: string, result: unknown) {
  return {
    id,
    contextId: id,
    status: { state: 'TASK_STATE_COMPLETED' },
    artifacts: [
      {
        artifactId: 'result',
        parts: [{ data: result, mediaType: 'application/json' }],
      },
    ],
  };
}
