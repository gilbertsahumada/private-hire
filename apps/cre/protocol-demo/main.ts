import { Runner, cre, type TeeRuntime } from '@chainlink/cre-sdk';
import { z } from 'zod';
import { createCreTransport } from '@private-hire/agent-transport/cre';
import { callTool, listTools } from '@private-hire/agent-transport/mcp';
import {
  sendMessage,
  getTask,
  taskPhase,
} from '@private-hire/agent-transport/a2a';

const configSchema = z.object({
  endpoint: z.string(),
  allowLocalHttp: z.boolean(),
  operation: z.enum(['mcp-list', 'mcp-call', 'a2a-send', 'a2a-get']),
  a: z.number().int().safe(),
  b: z.number().int().safe(),
  taskId: z.string().optional(),
});

function runDemo(runtime: TeeRuntime<z.infer<typeof configSchema>>) {
  const config = runtime.config;
  const transport = createCreTransport(runtime, {
    ...config,
    secretName: 'PROTOCOL_DEMO_TOKEN',
  });
  let output: unknown;
  switch (config.operation) {
    case 'mcp-list':
      output = listTools(transport, 'demo-list');
      break;
    case 'mcp-call':
      output = callTool(
        transport,
        'demo-call',
        {
          name: 'sum',
          inputSchema: {
            type: 'object',
            properties: { a: { type: 'integer' }, b: { type: 'integer' } },
            required: ['a', 'b'],
          },
        },
        { a: config.a, b: config.b },
      );
      break;
    case 'a2a-send':
      output = sendMessage(transport, 'demo-send', {
        messageId: 'demo-message',
        role: 'ROLE_USER',
        parts: [{ data: { a: config.a, b: config.b } }],
      });
      break;
    case 'a2a-get': {
      if (!config.taskId) throw new Error('DEMO_TASK_ID_REQUIRED');
      const task = getTask(transport, 'demo-get', config.taskId);
      output = { task, phase: taskPhase(task) };
      break;
    }
  }

  // Synthetic demo data only. Production workflows should return a public commitment instead.
  return 'PROTOCOL_DEMO_RESULT=' + JSON.stringify(output);
}

export async function main() {
  const runner = await Runner.newRunner({ configSchema });
  await runner.run(() => [
    cre.handlerInTee(
      new cre.capabilities.HTTPCapability().trigger({ authorizedKeys: [] }),
      runDemo,
      [{ tee: 'nitro', regions: ['us-west-2'] }],
    ),
  ]);
}

main();
