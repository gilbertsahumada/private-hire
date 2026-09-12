import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { privateKeyToAccount } from '../apps/web/node_modules/viem/accounts';
import { verifyMessage, keccak256, toHex } from '../apps/web/node_modules/viem';
import {
  challenge,
  verifyLogin,
  session,
  cookie,
} from '../apps/web/src/lib/auth';
import { requireOrigin, type MarketEnv } from '../apps/web/src/lib/market-env';
import { draft, manifest } from '../apps/web/src/lib/jobs';
import { runJob, getDelivery } from '../apps/web/src/lib/job-tasks';
import { chainClient } from '../apps/web/src/lib/catalog';
import { encrypt } from '../apps/web/src/lib/storage';
import {
  manifestSchema,
  jobCommitment,
  calculate,
} from '../packages/domain/src/index';
import { MARKET } from '../packages/chain/src/market';

function environment() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync('apps/web/migrations/0002_market.sql', 'utf8'));
  db.exec(readFileSync('apps/web/migrations/0003_job_fixtures.sql', 'utf8'));
  const objects = new Map<string, string>();
  let failReady = false;
  const env = {
    STORAGE_KEY: 'ab'.repeat(32),
    PUBLIC_ORIGIN: 'https://example.test',
    PRIVATE_DATA: {
      async get(key: string) {
        const body = objects.get(key);

        return body ? { text: async () => body } : null;
      },
      async put(key: string, body: string) {
        if (objects.has(key)) return null;
        objects.set(key, body);

        return {};
      },
    },
    DB: {
      prepare(sql: string) {
        let args: unknown[] = [];

        return {
          bind(...values: unknown[]) {
            args = values;

            return this;
          },
          async first() {
            return db.prepare(sql).get(...(args as never[])) ?? null;
          },
          async all() {
            return { results: db.prepare(sql).all(...(args as never[])) };
          },
          async run() {
            if (failReady && sql.includes("state='ready'")) {
              failReady = false;
              throw new Error('injected update failure');
            }

            return db.prepare(sql).run(...(args as never[]));
          },
        };
      },
    },
  } as unknown as MarketEnv;

  return {
    env,
    db,
    objects,
    failNextReady: () => {
      failReady = true;
    },
  };
}

const account = privateKeyToAccount(('0x' + '11'.repeat(32)) as `0x${string}`);

afterEach(() => vi.restoreAllMocks());

it('consumes a signed SIWE challenge only once under concurrent verification', async () => {
  const { env } = environment();
  const c = await challenge(env, account.address);
  const signature = await account.signMessage({ message: c.message });

  const verifier = async (args: Parameters<typeof verifyMessage>[0]) =>
    verifyMessage(args);

  const attempts = await Promise.allSettled([
    verifyLogin(env, c.nonce, signature, verifier),
    verifyLogin(env, c.nonce, signature, verifier),
  ]);
  expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const accepted = attempts.find((r) => r.status === 'fulfilled');
  if (accepted?.status !== 'fulfilled') throw new Error();
  expect(
    await session(
      new Request('https://example.test', {
        headers: { cookie: cookie(accepted.value.token) },
      }),
      env,
    ),
  ).toBe(account.address.toLowerCase());
});

it('rejects changed-domain signatures, expired challenges and cross-origin writes', async () => {
  const { env, db } = environment();
  const c = await challenge(env, account.address);
  const signature = await account.signMessage({
    message: c.message.replace('example.test', 'attacker.test'),
  });
  await expect(
    verifyLogin(env, c.nonce, signature, async (args) => verifyMessage(args)),
  ).rejects.toThrow('INVALID_LOGIN');
  db.prepare('UPDATE auth_challenges SET expires_at=0').run();
  await expect(verifyLogin(env, c.nonce, signature)).rejects.toThrow(
    'INVALID_LOGIN',
  );
  expect(() =>
    requireOrigin(
      new Request('https://example.test', {
        headers: { origin: 'https://attacker.test' },
      }),
      env,
    ),
  ).toThrow('INVALID_ORIGIN');
});

it('rejects expired sessions', async () => {
  const { env, db } = environment();
  const token = 'aa'.repeat(32);
  db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(
    keccak256(toHex(token)),
    account.address.toLowerCase(),
    0,
  );
  await expect(
    session(
      new Request('https://example.test', {
        headers: { cookie: cookie(token) },
      }),
      env,
    ),
  ).rejects.toThrow('SIGN_IN_REQUIRED');
});

async function seeded() {
  const state = environment();
  const { env, db, objects } = state;
  const m = manifestSchema.parse({
    schemaVersion: 'job-manifest/v1',
    durationMinutes: 15,
    requestId: 'job-test',
    chainId: '5042002',
    escrow: MARKET.escrow,
    buyer: account.address.toLowerCase(),
    provider: MARKET.provider.toLowerCase(),
    evaluator: '0x' + '33'.repeat(20),
    agentRegistry: `eip155:5042002:${MARKET.registry}`,
    agentId: '894552',
    endpoint: MARKET.origin + '/api/agent/a2a',
    a2aVersion: '1.0',
    input: {
      schemaVersion: 'portfolio-input/v1',
      requestId: 'job-test',
      positions: [
        {
          assetId: 'a',
          quantityAtomic: '3',
          quantityDecimals: 1,
          unitPriceMicrousd: '11',
        },
        {
          assetId: 'b',
          quantityAtomic: '7',
          quantityDecimals: 1,
          unitPriceMicrousd: '11',
        },
      ],
    },
    policy: {
      schemaVersion: 'portfolio-policy/v1',
      valueToleranceMicrousd: '0',
      weightToleranceBps: 0,
    },
    budget: '10000',
    token: '0x3600000000000000000000000000000000000000',
    expiredAt: Math.floor(Date.now() / 1000) + 600,
    nonce: '01'.repeat(32),
  });
  const hash = jobCommitment('manifest', m);
  db.prepare(
    'INSERT INTO market_drafts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ).run(
    m.requestId,
    m.buyer,
    m.provider,
    hash,
    'manifest',
    m.budget,
    m.expiredAt,
    m.expiredAt - 600,
    m.chainId,
    m.escrow,
    m.evaluator,
    '42',
    1,
    null,
  );
  objects.set(
    'manifest',
    await encrypt(env.STORAGE_KEY, `manifest:${m.buyer}:${m.requestId}`, m),
  );
  vi.spyOn(chainClient, 'readContract').mockResolvedValue({
    id: 42n,
    client: m.buyer,
    provider: m.provider,
    evaluator: m.evaluator,
    description: hash,
    budget: 10000n,
    expiredAt: BigInt(m.expiredAt),
    status: 1,
    hook: '0x' + '00'.repeat(20),
  } as never);

  return { ...state, m, hash };
}

it('uses independent truncation and weights for real job manifests', async () => {
  const { m } = await seeded();
  expect(calculate(m.input)).toMatchObject({
    totalValueMicrousd: '10',
    positions: [
      { valueMicrousd: '3', weightBps: 3000 },
      { valueMicrousd: '7', weightBps: 7000 },
    ],
    concentrationBps: 7000,
  });
});

it('concurrent job calls recover the same encrypted envelope and nonce', async () => {
  const { env, m, hash } = await seeded();
  const results = await Promise.all([
    runJob(env, m.requestId, m.input, hash),
    runJob(env, m.requestId, m.input, hash),
  ]);
  expect(results[0]).toEqual(results[1]);
  expect(results[0].envelope.nonce).toMatch(/^[a-f0-9]{64}$/);
});

it('repairs R2 success followed by D1 failure without recomputing the envelope', async () => {
  const { env, m, hash, objects, failNextReady } = await seeded();
  failNextReady();
  await expect(runJob(env, m.requestId, m.input, hash)).rejects.toThrow();
  const encrypted = [...objects.entries()].find(([k]) =>
    k.endsWith('result.json.enc'),
  )!;
  const recovered = await runJob(env, m.requestId, m.input, hash);
  expect(objects.get(encrypted[0])).toBe(encrypted[1]);
  expect(
    (await getDelivery(env, await draft(env, m.requestId))).resultHash,
  ).toBe(recovered.resultHash);
});

it('rejects cross-user access, changed input and tampered encrypted results', async () => {
  const { env, m, hash, objects } = await seeded();
  await expect(draft(env, m.requestId, '0x' + '44'.repeat(20))).rejects.toThrow(
    'JOB_NOT_FOUND',
  );
  const modified = structuredClone(m.input);
  modified.positions[0].quantityAtomic = '9';
  await expect(runJob(env, m.requestId, modified, hash)).rejects.toThrow(
    'CONFLICT',
  );
  await runJob(env, m.requestId, m.input, hash);
  const key = [...objects.keys()].find((k) => k.endsWith('result.json.enc'))!;
  const body = JSON.parse(objects.get(key)!);
  body.ciphertext =
    (body.ciphertext[0] === 'a' ? 'b' : 'a') + body.ciphertext.slice(1);
  objects.set(key, JSON.stringify(body));
  await expect(getDelivery(env, await draft(env, m.requestId))).rejects.toThrow(
    'INTEGRITY_PENDING',
  );
});

it('enables a committed rejection fixture only through isolated operator configuration', async () => {
  const { env, db, m, hash } = await seeded();
  db.prepare('INSERT INTO market_test_fixtures VALUES(?,?)').run(
    m.requestId,
    'plus-one',
  );
  env.ENABLE_JOB_TEST_FIXTURES = 'true';
  const result = await runJob(env, m.requestId, m.input, hash);
  expect(result.envelope.result).toMatchObject({ totalValueMicrousd: '11' });
  expect(result.resultHash).toBe(jobCommitment('result', result.envelope));
});

it('keeps provider views free of policy and rejects unrelated participants', async () => {
  const { env, m } = await seeded();
  const { jobView } = await import('../apps/web/src/lib/jobs');
  const d = await draft(env, m.requestId, m.provider);
  expect(await jobView(env, d, m.provider)).not.toHaveProperty('policy');
  expect(await jobView(env, d, m.buyer)).toHaveProperty('policy');
});

it('rejects funding a changed budget and actions at expiration', async () => {
  const { env, m } = await seeded();
  const catalog = await import('../apps/web/src/lib/catalog');
  vi.spyOn(catalog, 'verifyMarket').mockResolvedValue(undefined);
  const { prepareAction } = await import('../apps/web/src/lib/jobs');
  const d = await draft(env, m.requestId);
  const current = await catalog.chainClient.readContract({} as never);
  vi.mocked(catalog.chainClient.readContract).mockResolvedValue({
    ...(current as object),
    status: 0,
    budget: 9999n,
  } as never);
  await expect(prepareAction(env, d, m.buyer, 'fund')).rejects.toThrow(
    'ACTION_UNAVAILABLE',
  );
  vi.spyOn(Date, 'now').mockReturnValue(m.expiredAt * 1000);
  await expect(prepareAction(env, d, m.provider, 'budget')).rejects.toThrow(
    'JOB_EXPIRED',
  );
});

it('recovers a partially persisted quote only for identical requested conditions', async () => {
  const { env, db, m, objects } = await seeded();
  const catalog = await import('../apps/web/src/lib/catalog');
  vi.spyOn(catalog, 'verifyMarket').mockResolvedValue(undefined);
  vi.spyOn(catalog, 'verifyIdentity').mockResolvedValue(undefined);
  const { createDraft } = await import('../apps/web/src/lib/jobs');
  env.JOB_EVALUATOR = m.evaluator;
  objects.set(
    `jobs/${m.buyer}/${m.requestId}/manifest.json.enc`,
    objects.get('manifest')!,
  );
  db.prepare('DELETE FROM market_drafts').run();
  const body = {
    requestId: m.requestId,
    input: m.input,
    policy: m.policy,
    durationMinutes: 30,
  };
  await expect(createDraft(env, m.buyer, body)).rejects.toThrow('CONFLICT');
  const recovered = await createDraft(env, m.buyer, {
    ...body,
    durationMinutes: 15,
  });
  expect(recovered.manifest_hash).toBe(jobCommitment('manifest', m));
  expect((await manifest(env, recovered)).nonce).toBe(m.nonce);
});

it('rejects receipts signed by another wallet before recording any event', async () => {
  const { env, m } = await seeded();
  const { confirmTx } = await import('../apps/web/src/lib/jobs');
  vi.spyOn(chainClient, 'getTransactionReceipt').mockResolvedValue({
    status: 'success',
    from: m.provider,
  } as never);
  await expect(
    confirmTx(
      env,
      await draft(env, m.requestId),
      m.buyer,
      ('0x' + 'ab'.repeat(32)) as `0x${string}`,
    ),
  ).rejects.toThrow('WRONG_TRANSACTION');
});
