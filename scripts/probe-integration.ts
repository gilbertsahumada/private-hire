import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { strict as assert } from 'node:assert';
import {
  sendRequest,
  getRequest,
  rpcResult,
  completedTask,
} from '../packages/agent-transport/src/index';
import {
  evaluate,
  verifyEnvelope,
  commitment,
  type PortfolioInput,
} from '../packages/domain/src/index';
const env = Object.fromEntries(
  readFileSync(
    resolve(process.env.PROBE_CREDENTIALS_FILE ?? 'apps/web/.dev.vars'),
    'utf8',
  )
    .trim()
    .split('\n')
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);
const origin = process.env.PROBE_ORIGIN ?? 'http://127.0.0.1:8787';
const run = process.env.PROBE_RUN ?? Date.now().toString(36);
async function request(
  path: string,
  token: string,
  data?: unknown,
  version = '1.0',
) {
  return fetch(origin + path, {
    method: data === undefined ? 'GET' : 'POST',
    redirect: 'error',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'A2A-Version': version,
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}
const home = await fetch(origin, { redirect: 'error' });
assert.equal(home.status, 200);
assert.ok((await home.text()).includes('INTEGRATION PROBE'));
const card = (await (
  await fetch(origin + '/.well-known/agent-card.json')
).json()) as {
  supportedInterfaces: Array<{ protocolVersion: string; url: string }>;
  securitySchemes: unknown;
};
assert.equal(card.supportedInterfaces[0].protocolVersion, '1.0');
assert.equal(card.supportedInterfaces[0].url, origin + '/api/agent/a2a');
assert.ok(card.securitySchemes);
const probes: string[] = [];
for (const [label, tolerance, decision] of [
  ['reject', '0', 2],
  ['accept', '1', 1],
] as const) {
  const probeId = `probe-${run}-${label}`;
  probes.push(probeId);
  const input: PortfolioInput = {
    schemaVersion: 'portfolio-input/v1',
    requestId: probeId,
    positions: [
      {
        assetId: 'SYNTH-A',
        quantityAtomic: '15',
        quantityDecimals: 1,
        unitPriceMicrousd: '3',
      },
      {
        assetId: 'SYNTH-B',
        quantityAtomic: '10',
        quantityDecimals: 1,
        unitPriceMicrousd: '3',
      },
    ],
  };
  const policy = {
    schemaVersion: 'portfolio-policy/v1' as const,
    valueToleranceMicrousd: tolerance,
    weightToleranceBps: 0,
  };
  const setup = await request('/api/internal/probes', env.SETUP_TOKEN, {
    probeId,
    input,
    policy,
    validUntil: Math.floor(Date.now() / 1000) + 86400,
    fixture: 'plus-one',
  });
  assert.equal(setup.status, 200, `setup ${label}: ${await setup.text()}`);
  const send = sendRequest(probeId, input);
  const responses = await Promise.all(
    Array.from({ length: 3 }, async () => {
      const response = await request('/api/agent/a2a', env.A2A_TOKEN, send);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      return await response.json();
    }),
  );
  assert.deepEqual(responses[0], responses[1]);
  assert.deepEqual(responses[1], responses[2]);
  const get = getRequest(probeId);
  const response = await request('/api/agent/a2a', env.A2A_TOKEN, get);
  const artifact = completedTask(
    rpcResult(await response.json(), get.id),
    probeId,
  );
  const envelope = verifyEnvelope(
    artifact.envelope,
    probeId,
    commitment('input', input),
    artifact.resultHash,
  );
  assert.equal(evaluate(input, policy, envelope.result), decision);
  assert.ok(!JSON.stringify(artifact).includes('Tolerance'));
  assert.equal(
    (await request(`/api/internal/probes/${probeId}/context`, env.A2A_TOKEN))
      .status,
    401,
  );
  assert.equal(
    (await request('/api/agent/a2a', env.CONTEXT_TOKEN, get)).status,
    401,
  );
  assert.equal(
    (await request('/api/agent/a2a', env.A2A_TOKEN, get, '0.3')).status,
    400,
  );
  const altered = sendRequest(probeId, {
    ...input,
    positions: [{ ...input.positions[0], quantityAtomic: '99' }],
  });
  const conflict = (await (
    await request('/api/agent/a2a', env.A2A_TOKEN, altered)
  ).json()) as { error?: { message: string } };
  assert.equal(conflict.error?.message, 'CONFLICT');
  console.log(
    `${label}: persisted task, concurrent retries, private scopes and decision ${decision} verified`,
  );
}
const unknown = (await (
  await request('/api/agent/a2a', env.A2A_TOKEN, getRequest('unknown-task'))
).json()) as { error?: { code: number } };
assert.equal(unknown.error?.code, -32001);
mkdirSync('.local', { recursive: true });
for (let i = 0; i < probes.length; i++)
  writeFileSync(
    `.local/${i === 0 ? 'reject' : 'accept'}.json`,
    JSON.stringify({ probeId: probes[i] }),
  );
writeFileSync('.local/probes.json', JSON.stringify({ origin, probes }));
console.log(
  'Integration passed. Public CRE trigger payloads saved in .local/.',
);

const malformed = await fetch(origin + '/api/agent/a2a', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${env.A2A_TOKEN}`,
    'Content-Type': 'application/json',
    'A2A-Version': '1.0',
  },
  body: '{',
});
assert.equal(
  ((await malformed.json()) as { error: { code: number } }).error.code,
  -32700,
);
const method = await request('/api/agent/a2a', env.A2A_TOKEN, {
  jsonrpc: '2.0',
  id: 'unknown-method',
  method: 'Unknown',
  params: {},
});
assert.equal(
  ((await method.json()) as { error: { code: number } }).error.code,
  -32601,
);
console.log(
  'Status page, Agent Card, malformed JSON and unknown method verified.',
);
