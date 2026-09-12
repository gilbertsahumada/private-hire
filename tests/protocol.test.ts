import { it, expect } from 'vitest';
import {
  SendMessageRequest,
  Task,
  AgentCard,
} from '../apps/web/node_modules/@a2a-js/sdk/dist/index.js';
import {
  sendRequest,
  sendSchema,
  rpcResult,
  completedTask,
} from '../packages/agent-transport/src/index';

const input = {
  schemaVersion: 'portfolio-input/v1' as const,
  requestId: 'probe-wire',
  positions: [
    {
      assetId: 'a',
      quantityAtomic: '1',
      quantityDecimals: 0,
      unitPriceMicrousd: '1',
    },
  ],
};

it('matches official A2A 1.0 request serialization', () => {
  const req = sendRequest('probe-wire', input);
  const official = SendMessageRequest.toJSON(
    SendMessageRequest.fromJSON(req.params),
  );
  expect(official).toEqual(req.params);
  expect(sendSchema.safeParse(official).success).toBe(true);
});

it('matches official completed task serialization', () => {
  const task = {
    id: 'probe-wire',
    contextId: 'probe-wire',
    status: { state: 'TASK_STATE_COMPLETED' },
    artifacts: [
      {
        artifactId: 'result',
        parts: [
          {
            data: { envelope: {}, resultHash: '0x' + '00'.repeat(32) },
            mediaType: 'application/json',
          },
        ],
      },
    ],
  };
  expect(Task.toJSON(Task.fromJSON(task))).toEqual(task);
  expect(completedTask(task, 'probe-wire')).toHaveProperty('envelope');
});

it('rejects mismatched IDs, JSON-RPC errors and incomplete tasks', () => {
  expect(() =>
    rpcResult({ jsonrpc: '2.0', id: 'wrong', result: {} }, 'right'),
  ).toThrow();
  expect(() =>
    rpcResult(
      { jsonrpc: '2.0', id: 'right', error: { code: -32000 } },
      'right',
    ),
  ).toThrow();
  expect(() =>
    completedTask(
      { id: 'probe-wire', status: { state: 'TASK_STATE_WORKING' } },
      'probe-wire',
    ),
  ).toThrow();
});
