import { afterEach, it, expect, vi } from 'vitest';
import {
  cre,
  type TeeRuntime,
  type HTTPPayload,
} from '../apps/cre/node_modules/@chainlink/cre-sdk/dist/index.js';
import { onJob, configSchema } from '../apps/cre/jobs/workflow';
import { z } from '../apps/cre/node_modules/zod';
import {
  encodeFunctionResult,
  encodeAbiParameters,
  keccak256,
  toHex,
  hexToBytes,
  pad,
} from '../apps/web/node_modules/viem';
import { MARKET, escrowAbi } from '../packages/chain/src/index';
import {
  manifestSchema,
  jobCommitment,
  calculate,
} from '../packages/domain/src/index';

afterEach(() => vi.restoreAllMocks());

function fixture(tolerance = '0', httpStatus = 200, tamper = false) {
  const receiver = ('0x' + '33'.repeat(20)) as `0x${string}`;
  const m = manifestSchema.parse({
    schemaVersion: 'job-manifest/v1',
    durationMinutes: 15,
    requestId: 'job-flow',
    chainId: '5042002',
    escrow: MARKET.escrow,
    buyer: '0x' + '11'.repeat(20),
    provider: MARKET.provider,
    evaluator: receiver,
    agentRegistry: `eip155:5042002:${MARKET.registry}`,
    agentId: '894552',
    endpoint: MARKET.origin + '/api/agent/a2a',
    a2aVersion: '1.0',
    input: {
      schemaVersion: 'portfolio-input/v1',
      requestId: 'job-flow',
      positions: [
        {
          assetId: 'a',
          quantityAtomic: '1',
          quantityDecimals: 0,
          unitPriceMicrousd: '7',
        },
      ],
    },
    policy: {
      schemaVersion: 'portfolio-policy/v1',
      valueToleranceMicrousd: tolerance,
      weightToleranceBps: 0,
    },
    budget: '10000',
    token: '0x3600000000000000000000000000000000000000',
    expiredAt: 4102444800,
    nonce: '01'.repeat(32),
  });
  const result = calculate(m.input);
  result.totalValueMicrousd = '8';
  const envelope = {
    schemaVersion: 'job-result/v1',
    chainId: '5042002',
    escrow: MARKET.escrow,
    jobId: '42',
    requestId: 'job-flow',
    nonce: '02'.repeat(32),
    result,
  };
  const hash = jobCommitment('result', envelope);
  const manifestHash = jobCommitment('manifest', m);
  const submitTx = ('0x' + 'aa'.repeat(32)) as `0x${string}`;
  const report = vi.fn();
  const runtime = {
    config: {
      origin: MARKET.origin,
      allowLocalHttp: false,
      receiver,
      writeReport: false,
    },
    now: () => new Date('2026-09-12'),
    getSecret: () => ({ result: () => ({ value: 'secret-canary' }) }),
    usingTheDons: () => ({ report }),
  } as unknown as TeeRuntime<z.infer<typeof configSchema>>;
  vi.spyOn(
    cre.capabilities.HTTPClient.prototype,
    'sendRequest',
  ).mockImplementation(
    (_r, req: unknown) =>
      ({
        result() {
          const r = req as { body?: string };
          let body: unknown = { manifest: m, manifestHash, jobId: '42' };
          if (r.body) {
            const request = JSON.parse(
              Buffer.from(r.body, 'base64').toString(),
            );
            body = {
              jsonrpc: '2.0',
              id: request.id,
              result: {
                id: 'job-flow',
                contextId: 'job-flow',
                status: { state: 'TASK_STATE_COMPLETED' },
                artifacts: [
                  {
                    artifactId: 'r',
                    parts: [
                      {
                        data: {
                          envelope,
                          resultHash: tamper ? '0x' + '00'.repeat(32) : hash,
                        },
                      },
                    ],
                  },
                ],
              },
            };
          }

          return {
            statusCode: httpStatus,
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
  vi.spyOn(
    cre.capabilities.EVMClient.prototype,
    'callContract',
  ).mockReturnValue({
    result: () => ({
      data: hexToBytes(
        encodeFunctionResult({
          abi: escrowAbi,
          functionName: 'getJob',
          result: {
            id: 42n,
            client: m.buyer as `0x${string}`,
            provider: MARKET.provider,
            evaluator: receiver,
            description: manifestHash,
            budget: 10000n,
            expiredAt: BigInt(m.expiredAt),
            status: 2,
            hook: ('0x' + '00'.repeat(20)) as `0x${string}`,
          },
        }),
      ),
    }),
  } as never);
  vi.spyOn(
    cre.capabilities.EVMClient.prototype,
    'getTransactionReceipt',
  ).mockReturnValue({
    result: () => ({
      receipt: {
        status: 1n,
        txHash: hexToBytes(submitTx),
        logs: [
          {
            address: hexToBytes(MARKET.escrow),
            topics: [
              hexToBytes(
                keccak256(toHex('JobSubmitted(uint256,address,bytes32)')),
              ),
              hexToBytes(pad(toHex(42n))),
              hexToBytes(pad(MARKET.provider)),
            ],
            data: hexToBytes(
              encodeAbiParameters([{ type: 'bytes32' }], [hash]),
            ),
            txHash: hexToBytes(submitTx),
            blockHash: hexToBytes('0x' + 'bb'.repeat(32)),
          },
        ],
      },
    }),
  } as never);

  return {
    runtime,
    report,
    payload: {
      input: new TextEncoder().encode(
        JSON.stringify({ requestId: 'job-flow', phase: 'evaluate', submitTx }),
      ),
    } as HTTPPayload,
  };
}

it('evaluates committed one-unit differences with inclusive private tolerances', () => {
  let f = fixture('0');
  expect(onJob(f.runtime, f.payload)).toContain('decision=2');
  vi.restoreAllMocks();
  f = fixture('1');
  expect(onJob(f.runtime, f.payload)).toContain('decision=1');
  expect(f.report).not.toHaveBeenCalled();
});

it('leaves transport and integrity failures pending instead of rejecting', () => {
  let f = fixture('0', 401);
  expect(() => onJob(f.runtime, f.payload)).toThrow('JOB_PENDING');
  expect(f.report).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  f = fixture('0', 200, true);
  expect(() => onJob(f.runtime, f.payload)).toThrow('JOB_PENDING');
  expect(f.report).not.toHaveBeenCalled();
});
