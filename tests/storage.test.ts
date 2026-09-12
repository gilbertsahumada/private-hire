import { describe, it, expect } from 'vitest';
import {
  encrypt,
  decrypt,
  type Bindings,
  type Statement,
} from '../apps/web/src/lib/storage';
import {
  setupProbe,
  startTask,
  getTask,
  getContext,
} from '../apps/web/src/lib/service';

// In-memory fault injection complements the real D1/R2 integration script.
function environment() {
  const objects = new Map<string, string>();
  const probes = new Map<string, Record<string, unknown>>();
  const tasks = new Map<string, Record<string, unknown>>();
  let failUpdate = false;
  const env: Bindings = {
    STORAGE_KEY: 'ab'.repeat(32),
    A2A_TOKEN: 'a'.repeat(40),
    CONTEXT_TOKEN: 'c'.repeat(40),
    SETUP_TOKEN: 's'.repeat(40),
    PUBLIC_ORIGIN: 'http://127.0.0.1:8787',
    ENABLE_PROBE: 'true',
    PRIVATE_DATA: {
      async get(key) {
        const body = objects.get(key);
        return body === undefined ? null : { text: async () => body };
      },
      async put(key, body) {
        if (objects.has(key)) return null;
        objects.set(key, body);
        return {};
      },
    },
    DB: {
      prepare(sql) {
        let args: unknown[] = [];
        const stmt: Statement = {
          bind(...values) {
            args = values;
            return stmt;
          },
          async first<T>() {
            return (
              ((sql.includes('FROM probes') ? probes : tasks).get(
                String(args[0]),
              ) as T) ?? null
            );
          },
          async run() {
            if (
              sql.startsWith('INSERT OR IGNORE INTO probes') &&
              !probes.has(String(args[0]))
            )
              probes.set(String(args[0]), {
                probe_id: args[0],
                context_hash: args[1],
                input_hash: args[2],
                context_key: args[3],
                fixture: args[4],
              });
            if (
              sql.startsWith('INSERT OR IGNORE INTO agent_tasks') &&
              !tasks.has(String(args[0]))
            )
              tasks.set(String(args[0]), {
                probe_id: args[0],
                request_hash: args[1],
                result_key: args[2],
                result_hash: null,
                state: 'reserved',
              });
            if (sql.startsWith('UPDATE')) {
              if (failUpdate) {
                failUpdate = false;
                throw new Error('injected D1 failure');
              }
              const task = tasks.get(String(args[1]))!;
              if (task.state === 'reserved' && task.result_hash === null) {
                task.state = 'ready';
                task.result_hash = args[0];
              }
            }
            return {};
          },
        };
        return stmt;
      },
    },
  };
  return {
    env,
    objects,
    failNextUpdate() {
      failUpdate = true;
    },
  };
}
const id = 'probe-storage';
const input = {
  schemaVersion: 'portfolio-input/v1' as const,
  requestId: id,
  positions: [
    {
      assetId: 'a',
      quantityAtomic: '1',
      quantityDecimals: 0,
      unitPriceMicrousd: '100',
    },
  ],
};
const setup = {
  probeId: id,
  input,
  policy: {
    schemaVersion: 'portfolio-policy/v1',
    valueToleranceMicrousd: '0',
    weightToleranceBps: 0,
  },
  validUntil: 4102444800,
  fixture: 'plus-one',
};
describe('encrypted persistence and fault recovery', () => {
  it('encrypts with fresh IVs and rejects tamper, wrong key and AAD', async () => {
    const a = await encrypt('ab'.repeat(32), 'context:a', input),
      b = await encrypt('ab'.repeat(32), 'context:a', input);
    expect(a).not.toBe(b);
    expect(a).not.toContain('unitPrice');
    expect(await decrypt('ab'.repeat(32), 'context:a', a)).toEqual(input);
    await expect(decrypt('ab'.repeat(32), 'context:b', a)).rejects.toThrow();
    await expect(decrypt('bc'.repeat(32), 'context:a', a)).rejects.toThrow();
    const tampered = JSON.parse(a);
    tampered.ciphertext = 'ff' + tampered.ciphertext.slice(2);
    await expect(
      decrypt('ab'.repeat(32), 'context:a', JSON.stringify(tampered)),
    ).rejects.toThrow();
  });
  it('recovers the exact envelope after R2 succeeds and D1 fails', async () => {
    const e = environment();
    await setupProbe(e.env, setup);
    e.failNextUpdate();
    await expect(startTask(e.env, id, input)).rejects.toThrow();
    const before = e.objects.get(`probes/${id}/result.json.enc`);
    const task = await startTask(e.env, id, input);
    expect(e.objects.get(`probes/${id}/result.json.enc`)).toBe(before);
    expect(await getTask(e.env, id)).toEqual(task);
  });
  it('concurrent starts converge and changed contents conflict', async () => {
    const e = environment();
    await setupProbe(e.env, setup);
    const tasks = await Promise.all(
      Array.from({ length: 5 }, () => startTask(e.env, id, input)),
    );
    for (const task of tasks) expect(task).toEqual(tasks[0]);
    await expect(
      startTask(e.env, id, {
        ...input,
        positions: [{ ...input.positions[0], quantityAtomic: '2' }],
      }),
    ).rejects.toThrow('CONFLICT');
    await expect(
      setupProbe(e.env, { ...setup, fixture: 'correct' }),
    ).rejects.toThrow('CONFLICT');
  });
  it('missing confirmed object cannot regenerate a nonce', async () => {
    const e = environment();
    await setupProbe(e.env, setup);
    await startTask(e.env, id, input);
    e.objects.delete(`probes/${id}/result.json.enc`);
    await expect(startTask(e.env, id, input)).rejects.toThrow(
      'INTEGRITY_PENDING',
    );
    expect(e.objects.has(`probes/${id}/result.json.enc`)).toBe(false);
  });
  it('keeps policy out of task artifacts', async () => {
    const e = environment();
    await setupProbe(e.env, setup);
    expect((await getContext(e.env, id)).policy.valueToleranceMicrousd).toBe(
      '0',
    );
    expect(JSON.stringify(await startTask(e.env, id, input))).not.toContain(
      'Tolerance',
    );
  });
});
