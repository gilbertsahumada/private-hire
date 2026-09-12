import {
  calculate,
  canonical,
  commitment,
  contextSchema,
  inputSchema,
  policySchema,
  probeIdSchema,
  verifyEnvelope,
  type ProbeContext,
  type PortfolioInput,
} from '@private-hire/domain';
import { readObject, writeOnce, nonce, type Bindings } from './storage';

interface ProbeRow {
  probe_id: string;
  context_hash: string;
  input_hash: string;
  context_key: string;
  fixture: 'correct' | 'plus-one';
}

interface TaskRow {
  probe_id: string;
  request_hash: string;
  result_key: string;
  result_hash: string | null;
  state: 'reserved' | 'ready';
}

const aad = (kind: string, id: string) => `probe:v1:${kind}:staging:${id}`;

export async function setupProbe(env: Bindings, raw: unknown) {
  if (env.ENABLE_PROBE !== 'true') throw new Error('PROBE_DISABLED');
  if (!raw || typeof raw !== 'object') throw new Error('INVALID_SETUP');
  const data = raw as Record<string, unknown>;
  if (
    Object.keys(data).some(
      (k) =>
        !['probeId', 'input', 'policy', 'validUntil', 'fixture'].includes(k),
    )
  )
    throw new Error('INVALID_SETUP');
  const probeId = probeIdSchema.parse(data.probeId);
  const input = inputSchema.parse(data.input);
  const policy = policySchema.parse(data.policy);
  if (
    input.requestId !== probeId ||
    !['correct', 'plus-one'].includes(String(data.fixture))
  )
    throw new Error('INVALID_SETUP');
  const context = contextSchema.parse({
    probeId,
    input,
    policy,
    validUntil: data.validUntil,
    inputHash: commitment('input', input),
  });
  if (context.validUntil <= Math.floor(Date.now() / 1000))
    throw new Error('PROBE_EXPIRED');
  const contextHash = commitment('context', context);
  const key = `probes/${probeId}/context.json.enc`;
  await env.DB.prepare(
    'INSERT OR IGNORE INTO probes (probe_id, context_hash, input_hash, context_key, fixture) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(probeId, contextHash, context.inputHash, key, data.fixture)
    .run();
  const row = await probeRow(env, probeId);
  if (row.context_hash !== contextHash || row.fixture !== data.fixture)
    throw new Error('CONFLICT');
  const persisted = await writeOnce(env, key, aad('context', probeId), context);
  if (commitment('context', persisted) !== contextHash)
    throw new Error('INTEGRITY_PENDING');

  return { probeId, contextHash };
}

async function probeRow(env: Bindings, id: string) {
  const row = await env.DB.prepare('SELECT * FROM probes WHERE probe_id = ?')
    .bind(probeIdSchema.parse(id))
    .first<ProbeRow>();
  if (!row) throw new Error('PROBE_NOT_FOUND');

  return row;
}

export async function getContext(
  env: Bindings,
  id: string,
): Promise<ProbeContext> {
  const row = await probeRow(env, id);
  const saved = await readObject(env, row.context_key, aad('context', id));
  if (!saved || commitment('context', saved) !== row.context_hash)
    throw new Error('INTEGRITY_PENDING');
  const context = contextSchema.parse(saved);
  if (
    context.probeId !== id ||
    context.input.requestId !== id ||
    context.inputHash !== row.input_hash ||
    commitment('input', context.input) !== context.inputHash
  )
    throw new Error('INTEGRITY_PENDING');

  return context;
}

export async function startTask(
  env: Bindings,
  id: string,
  input: PortfolioInput,
) {
  const context = await getContext(env, id);
  if (context.validUntil <= Math.floor(Date.now() / 1000))
    throw new Error('PROBE_EXPIRED');
  const requestHash = commitment('input', inputSchema.parse(input));
  if (input.requestId !== id || requestHash !== context.inputHash)
    throw new Error('CONFLICT');
  const key = `probes/${id}/result.json.enc`;
  await env.DB.prepare(
    "INSERT OR IGNORE INTO agent_tasks (probe_id, request_hash, result_key, state) VALUES (?, ?, ?, 'reserved')",
  )
    .bind(id, requestHash, key)
    .run();
  const row = await env.DB.prepare(
    'SELECT * FROM agent_tasks WHERE probe_id = ?',
  )
    .bind(id)
    .first<TaskRow>();
  if (!row || row.request_hash !== requestHash || row.result_key !== key)
    throw new Error('CONFLICT');
  let saved = await readObject(env, key, aad('result', id));
  if (row.state === 'ready' && !saved) throw new Error('INTEGRITY_PENDING');
  if (!saved) {
    const result = calculate(input);
    if ((await probeRow(env, id)).fixture === 'plus-one')
      result.totalValueMicrousd = (
        BigInt(result.totalValueMicrousd) + 1n
      ).toString();
    saved = await writeOnce(env, key, aad('result', id), {
      schemaVersion: 'probe-result/v1',
      probeId: id,
      requestHash,
      nonce: nonce(),
      result,
    });
  }
  const hash = commitment('result', saved);
  verifyEnvelope(saved, id, requestHash, hash);
  if (row.result_hash && row.result_hash !== hash)
    throw new Error('INTEGRITY_PENDING');
  await env.DB.prepare(
    "UPDATE agent_tasks SET state = 'ready', result_hash = ? WHERE probe_id = ? AND state = 'reserved' AND result_hash IS NULL",
  )
    .bind(hash, id)
    .run();

  return getTask(env, id);
}

export async function getTask(env: Bindings, id: string) {
  probeIdSchema.parse(id);
  const row = await env.DB.prepare(
    'SELECT * FROM agent_tasks WHERE probe_id = ?',
  )
    .bind(id)
    .first<TaskRow>();
  if (!row) throw new Error('TASK_NOT_FOUND');
  if (row.state !== 'ready' || !row.result_hash)
    throw new Error('TASK_PENDING');
  const envelope = verifyEnvelope(
    await readObject(env, row.result_key, aad('result', id)),
    id,
    row.request_hash,
    row.result_hash,
  );

  return {
    id,
    contextId: id,
    status: { state: 'TASK_STATE_COMPLETED' },
    artifacts: [
      {
        artifactId: `${id}-result`,
        parts: [
          {
            data: { envelope, resultHash: row.result_hash },
            mediaType: 'application/json',
          },
        ],
      },
    ],
  };
}
