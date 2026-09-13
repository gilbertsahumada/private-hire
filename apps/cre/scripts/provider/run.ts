import {
  createPublicClient,
  http,
  fallback,
  keccak256,
  zeroAddress,
  parseEther,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ARC, MARKET, arcChain, escrowAbi } from '@private-hire/chain';
import { deliverySchema, jobCommitment } from '@private-hire/domain';
import {
  jobSendRequest,
  getRequest,
  rpcResult,
  completedTask,
} from '@private-hire/agent-transport';
import { mkdirSync, rmdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import {
  workSchema,
  nextAction,
  expectedData,
  validatePrepared,
  same,
  type Work,
} from './safety';
import { readJournal, saveJournal } from './journal';
import { recoverPending } from './recovery';

const origin = process.env.PROVIDER_ORIGIN ?? MARKET.origin;
if (origin !== MARKET.origin && !/^http:\/\/127\.0\.0\.1:[0-9]+$/.test(origin))
  throw new Error('PROVIDER_ORIGIN_NOT_ALLOWED');
const client = createPublicClient({
  chain: arcChain,
  transport: fallback([
    http(ARC.rpc),
    http('https://rpc.blockdaemon.testnet.arc.network'),
  ]),
});
const stateDirectory = resolve('../../.local/provider-state');
const statePath = resolve(stateDirectory, 'journal.json');
const broadcast = process.argv.includes('--broadcast');
const watch = process.argv.includes('--watch');

async function request(
  path: string,
  body?: unknown,
  a2a = false,
): Promise<unknown> {
  const token = a2a
    ? process.env.PROVIDER_A2A_TOKEN
    : process.env.PROVIDER_SERVICE_TOKEN;
  if (!token || token.length < 32)
    throw new Error('PROVIDER_CREDENTIAL_MISSING');
  const response = await fetch(origin + path, {
    method: body === undefined ? 'GET' : 'POST',
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'A2A-Version': '1.0',
      'User-Agent': 'private-hire-provider/1',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (
    !response.ok ||
    !response.headers.get('content-type')?.startsWith('application/json')
  )
    throw new Error('PROVIDER_API_PENDING');
  if (a2a && response.headers.get('a2a-version') !== '1.0')
    throw new Error('PROVIDER_A2A_VERSION');
  const text = await response.text();
  if (text.length > 200000) throw new Error('PROVIDER_RESPONSE_LIMIT');
  return JSON.parse(text);
}

async function verifyChain(work: Work) {
  if ((await client.getChainId()) !== ARC.id)
    throw new Error('PROVIDER_CHAIN_MISMATCH');
  const job = await client.readContract({
    address: MARKET.escrow,
    abi: escrowAbi,
    functionName: 'getJob',
    args: [BigInt(work.jobId!)],
  });
  if (
    !same(job.client, work.buyer) ||
    !same(job.provider, MARKET.provider) ||
    !same(job.evaluator, work.evaluator) ||
    job.description !== work.manifestHash ||
    job.expiredAt !== BigInt(work.expiredAt) ||
    job.hook !== zeroAddress ||
    job.id.toString() !== work.jobId
  )
    throw new Error('PROVIDER_CHAIN_JOB_MISMATCH');
  return { ...work, status: job.status, onchainBudget: job.budget.toString() };
}

async function deliver(work: Work) {
  const send = jobSendRequest(work.requestId, work.manifestHash, work.input);
  const sent = rpcResult(
    await request('/api/agent/a2a', send, true),
    send.id,
  ) as { task?: unknown };
  const first = completedTask(sent?.task, work.requestId);
  const get = getRequest(work.requestId);
  const recovered = completedTask(
    rpcResult(await request('/api/agent/a2a', get, true), get.id),
    work.requestId,
  );
  const envelope = deliverySchema.parse(recovered.envelope);
  const hash = jobCommitment('result', envelope);
  if (
    hash !== recovered.resultHash ||
    hash !== first.resultHash ||
    hash !== jobCommitment('result', deliverySchema.parse(first.envelope)) ||
    envelope.chainId !== String(ARC.id) ||
    !same(envelope.escrow, MARKET.escrow) ||
    envelope.jobId !== work.jobId ||
    envelope.requestId !== work.requestId
  )
    throw new Error('PROVIDER_INTEGRITY_PENDING');
  return hash;
}

async function recover() {
  const journal = readJournal(statePath);
  if (
    journal.pending &&
    journal.pending.requestId !== process.env.PROVIDER_REQUEST_ID
  )
    throw new Error('PROVIDER_PENDING_SCOPE_MISMATCH');
  await recoverPending(journal, {
    async receipt(hash) {
      try {
        return await client.getTransactionReceipt({ hash });
      } catch {
        return null;
      }
    },
    async blockHash(blockNumber) {
      return (await client.getBlock({ blockNumber })).hash;
    },
    async now() {
      return (await client.getBlock()).timestamp;
    },
    async broadcast(raw) {
      return client.sendRawTransaction({ serializedTransaction: raw });
    },
    async confirm(id, hash) {
      return request(`/api/internal/provider/jobs/${id}/confirm`, { hash });
    },
    save(journal) {
      saveJournal(statePath, journal);
    },
  });
}

async function signAction(work: Work, action: 'budget' | 'submit', hash?: Hex) {
  const data = expectedData(work, action, hash);
  const prepared = await request(
    `/api/internal/provider/jobs/${work.requestId}/${action}`,
    {},
  );
  validatePrepared(prepared, data);
  const key = process.env.PROVIDER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key))
    throw new Error('PROVIDER_KEY_MISSING');
  const account = privateKeyToAccount(key as Hex);
  if (!same(account.address, MARKET.provider))
    throw new Error('PROVIDER_KEY_MISMATCH');
  const block = await client.getBlock();
  const fresh = await verifyChain(work);
  if (
    nextAction(
      fresh,
      block.timestamp,
      BigInt(process.env.PROVIDER_MAX_BUDGET_ATOMIC ?? '10000'),
    ) !== action
  )
    throw new Error('PROVIDER_STATE_CHANGED');
  const nonce = await client.getTransactionCount({
    address: account.address,
    blockTag: 'pending',
  });
  if (
    nonce !==
    (await client.getTransactionCount({
      address: account.address,
      blockTag: 'latest',
    }))
  )
    throw new Error('PROVIDER_EXTERNAL_TRANSACTION_PENDING');
  const gas =
    ((await client.estimateGas({
      account,
      to: MARKET.escrow,
      data,
      value: 0n,
    })) *
      120n) /
    100n;
  const gasPrice = await client.getGasPrice();
  const reserve = gas * gasPrice;
  const journal = readJournal(statePath);
  if (journal.pending) throw new Error('PROVIDER_TRANSACTION_PENDING');
  if (
    reserve > parseEther(process.env.PROVIDER_MAX_TX_GAS_USDC ?? '0.02') ||
    reserve + BigInt(journal.reservedGasWei) >
      parseEther(process.env.PROVIDER_TOTAL_GAS_USDC ?? '0.05')
  )
    throw new Error('PROVIDER_GAS_LIMIT');
  const raw = await account.signTransaction({
    chainId: ARC.id,
    type: 'legacy',
    to: MARKET.escrow,
    data,
    value: 0n,
    gas,
    gasPrice,
    nonce,
  });
  journal.reservedGasWei = (
    BigInt(journal.reservedGasWei) + reserve
  ).toString();
  journal.pending = {
    requestId: work.requestId,
    action,
    raw,
    hash: keccak256(raw),
    expiry: work.expiredAt,
  };
  saveJournal(statePath, journal);
  // Never sign again if this call times out: recovery resends these same bytes.
  await client.sendRawTransaction({ serializedTransaction: raw });
  console.log(
    JSON.stringify({
      requestId: work.requestId,
      action,
      hash: journal.pending.hash,
    }),
  );
}

async function cycle() {
  if (broadcast) await recover();
  let after = '';
  let scanned = 0;
  do {
    const page = z
      .object({ requestIds: z.array(z.string()), next: z.string().nullable() })
      .parse(
        await request(
          '/api/internal/provider/jobs?after=' + encodeURIComponent(after),
        ),
      );
    for (const id of page.requestIds) {
      if (
        process.env.PROVIDER_REQUEST_ID &&
        id !== process.env.PROVIDER_REQUEST_ID
      )
        continue;
      scanned++;
      try {
        const work = await verifyChain(
          workSchema.parse(
            await request(`/api/internal/provider/jobs/${id}/work`),
          ),
        );
        const action = nextAction(
          work,
          (await client.getBlock()).timestamp,
          BigInt(process.env.PROVIDER_MAX_BUDGET_ATOMIC ?? '10000'),
        );
        console.log(
          JSON.stringify({
            requestId: id,
            action,
            mode: broadcast ? 'authorized' : 'read-only',
          }),
        );
        if (!broadcast || action === 'skip' || action === 'wait') continue;
        const hash = action === 'submit' ? await deliver(work) : undefined;
        await signAction(work, action, hash);
        return; // One pending transaction at a time, across all requests.
      } catch (error) {
        if (readJournal(statePath).pending) throw error;
        console.error(JSON.stringify({ requestId: id, state: 'pending' }));
      }
    }
    after = page.next ?? '';
  } while (after);
  console.log(
    JSON.stringify({ scanned, mode: broadcast ? 'authorized' : 'read-only' }),
  );
}

async function main() {
  if (
    process.argv.slice(2).some((a) => !['--watch', '--broadcast'].includes(a))
  )
    throw new Error('PROVIDER_UNKNOWN_ARGUMENT');
  // Read-only mode neither loads a key nor invokes A2A or preparation endpoints.
  if (
    broadcast &&
    (process.env.ALLOW_PROVIDER_BROADCAST !== 'yes' || origin !== MARKET.origin)
  )
    throw new Error('PROVIDER_AUTHORIZATION_REQUIRED');
  if (
    broadcast &&
    !/^[a-z0-9][a-z0-9-]{0,63}$/.test(process.env.PROVIDER_REQUEST_ID ?? '')
  )
    throw new Error('PROVIDER_REQUEST_SCOPE_REQUIRED');
  if (broadcast) {
    const key = process.env.PROVIDER_PRIVATE_KEY;
    if (
      !key ||
      !/^0x[0-9a-fA-F]{64}$/.test(key) ||
      !same(privateKeyToAccount(key as Hex).address, MARKET.provider)
    )
      throw new Error('PROVIDER_KEY_MISMATCH');
  }
  mkdirSync(stateDirectory, { recursive: true, mode: 0o700 });
  const lock = resolve(stateDirectory, 'runner.lock');
  mkdirSync(lock); // Atomic lock. A stale lock needs operator review after a crash.
  let stopping = false;
  process.on('SIGINT', () => {
    stopping = true;
  });
  process.on('SIGTERM', () => {
    stopping = true;
  });
  try {
    do {
      try {
        await cycle();
      } catch (error) {
        const code =
          error instanceof Error && /^PROVIDER_[A-Z_]+$/.test(error.message)
            ? error.message
            : 'PROVIDER_OPERATION_PENDING';
        console.error(code);
        if (!watch) process.exitCode = 1;
      }
      if (watch && !stopping) await new Promise((r) => setTimeout(r, 15000));
    } while (watch && !stopping);
  } finally {
    rmdirSync(lock);
  }
}

main().catch(() => {
  console.error('PROVIDER_START_FAILED');
  process.exitCode = 1;
});
