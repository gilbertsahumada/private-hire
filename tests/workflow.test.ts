import { afterEach, it, expect, vi } from 'vitest';
import {
  cre,
  type TeeRuntime,
  type HTTPPayload,
} from '../apps/cre/node_modules/@chainlink/cre-sdk/dist/index.js';
import { onProbe, type configSchema } from '../apps/cre/probe/workflow';
import { calculate, commitment } from '../packages/domain/src/index';
import { z } from '../apps/cre/node_modules/zod';

afterEach(() => vi.restoreAllMocks());

const probeId = 'probe-workflow';

const input = {
  schemaVersion: 'portfolio-input/v1' as const,
  requestId: probeId,
  positions: [
    {
      assetId: 'SYNTH-A',
      quantityAtomic: '1',
      quantityDecimals: 0,
      unitPriceMicrousd: '7',
    },
  ],
};

const inputHash = commitment('input', input);

const context = {
  probeId,
  input,
  inputHash,
  policy: {
    schemaVersion: 'portfolio-policy/v1',
    valueToleranceMicrousd: '0',
    weightToleranceBps: 0,
  },
  validUntil: 4102444800,
};

const envelope = {
  schemaVersion: 'probe-result/v1',
  probeId,
  requestHash: inputHash,
  nonce: '00'.repeat(32),
  result: calculate(input),
};

const task = {
  id: probeId,
  contextId: probeId,
  status: { state: 'TASK_STATE_COMPLETED' },
  artifacts: [
    {
      artifactId: 'r',
      parts: [
        { data: { envelope, resultHash: commitment('result', envelope) } },
      ],
    },
  ],
};

const payload = {
  input: new TextEncoder().encode(JSON.stringify({ probeId })),
} as HTTPPayload;

function runtime() {
  const report = vi.fn(() => ({ result: () => ({}) }));
  const don = { report };

  return {
    report,
    runtime: {
      config: {
        origin: 'https://probe.example',
        allowLocalHttp: false,
        receiver: '0x1111111111111111111111111111111111111111',
        writeReport: true,
      },
      getSecret: () => ({ result: () => ({ value: 'private-canary' }) }),
      now: () => new Date('2026-01-01'),
      usingTheDons: () => don,
    } as unknown as TeeRuntime<z.infer<typeof configSchema>>,
  };
}

function mockHttp(status = 200) {
  vi.spyOn(
    cre.capabilities.HTTPClient.prototype,
    'sendRequest',
  ).mockImplementation(
    (_runtime, req: unknown) =>
      ({
        result() {
          const r = req as { url: string; body?: string };
          let body: unknown = context;
          if (r.body) {
            const request = JSON.parse(
              Buffer.from(r.body, 'base64').toString(),
            );
            body = {
              jsonrpc: '2.0',
              id: request.id,
              result: request.method === 'SendMessage' ? { task } : task,
            };
          }

          return {
            statusCode: status,
            body: new TextEncoder().encode(JSON.stringify(body)),
            headers: {},
            multiHeaders: {
              'content-type': { values: ['application/json'] },
              'a2a-version': { values: ['1.0'] },
            },
          };
        },
      }) as never,
  );
}

it('does not report rejection when infrastructure returns 401', () => {
  const r = runtime();
  mockHttp(401);
  expect(() => onProbe(r.runtime, payload)).toThrow('PROBE_PENDING');
  expect(r.report).not.toHaveBeenCalled();
});

it('emits only the ABI public report and rejects failed chain writes', () => {
  const r = runtime();
  mockHttp();
  vi.spyOn(
    cre.capabilities.EVMClient.prototype,
    'callContract',
  ).mockReturnValue({
    result: () => ({ data: new Uint8Array([...Array(31).fill(0), 6]) }),
  } as never);
  const write = vi
    .spyOn(cre.capabilities.EVMClient.prototype, 'writeReport')
    .mockReturnValue({
      result: () => ({ txStatus: 1, receiverContractExecutionStatus: 1 }),
    } as never);
  expect(() => onProbe(r.runtime, payload)).toThrow('PROBE_PENDING');
  expect(write).toHaveBeenCalledOnce();
  expect(r.report).toHaveBeenCalledOnce();
  expect(JSON.stringify(r.report.mock.calls)).not.toContain('private-canary');
  expect(JSON.stringify(r.report.mock.calls)).not.toContain('Tolerance');
});
