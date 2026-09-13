import metadata from '../../public/agent/registration.json';
import snapshot from './agent-snapshot.json';
import {
  createPublicClient,
  http,
  fallback,
  keccak256,
  parseAbi,
  type Address,
} from 'viem';
import { arcChain as arcTestnet } from '@private-hire/chain';
import { ARC, MARKET, escrowAbi, identityAbi } from '@private-hire/chain';
import { z } from 'zod';
import { type MarketEnv, MarketError } from './market-env';

export const chainClient = createPublicClient({
  chain: arcTestnet,
  transport: fallback(
    [
      http(ARC.rpc, { timeout: 8000 }),
      http('https://rpc.blockdaemon.testnet.arc.network', { timeout: 8000 }),
    ],
    { retryCount: 1, rank: false },
  ),
});

export const same = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();

export async function verifyMarket(env: MarketEnv) {
  if (
    env.JOBS_ENABLED !== 'true' ||
    !env.JOB_EVALUATOR ||
    !env.JOB_EVALUATOR_CODE_HASH ||
    /^0x0{40}$/i.test(env.JOB_EVALUATOR)
  )
    throw new MarketError('CONTRACTING_NOT_ENABLED', 503);
  const [chainId, code, slot, token, platform, evaluatorFee] =
    await Promise.all([
      chainClient.getChainId(),
      chainClient.getCode({ address: MARKET.escrow }),
      chainClient.getStorageAt({
        address: MARKET.escrow,
        slot: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
      }),
      chainClient.readContract({
        address: MARKET.escrow,
        abi: escrowAbi,
        functionName: 'paymentToken',
      }),
      chainClient.readContract({
        address: MARKET.escrow,
        abi: escrowAbi,
        functionName: 'platformFeeBP',
      }),
      chainClient.readContract({
        address: MARKET.escrow,
        abi: escrowAbi,
        functionName: 'evaluatorFeeBP',
      }),
    ]);
  const evaluatorAddress = env.JOB_EVALUATOR as Address;
  const evaluatorAbi = parseAbi([
    'function forwarder() view returns (address)',
    'function escrow() view returns (address)',
    'function SIMULATION_ONLY() view returns (bool)',
  ]);
  const [evaluatorCode, forwarder, evaluatorEscrow, simulation] =
    await Promise.all([
      chainClient.getCode({ address: evaluatorAddress }),
      chainClient.readContract({
        address: evaluatorAddress,
        abi: evaluatorAbi,
        functionName: 'forwarder',
      }),
      chainClient.readContract({
        address: evaluatorAddress,
        abi: evaluatorAbi,
        functionName: 'escrow',
      }),
      chainClient.readContract({
        address: evaluatorAddress,
        abi: evaluatorAbi,
        functionName: 'SIMULATION_ONLY',
      }),
    ]);
  if (
    !evaluatorCode ||
    keccak256(evaluatorCode) !== env.JOB_EVALUATOR_CODE_HASH ||
    !same(forwarder, ARC.mockForwarder) ||
    !same(evaluatorEscrow, MARKET.escrow) ||
    !simulation
  )
    throw new MarketError('EVALUATOR_CONFIGURATION_CHANGED', 503);
  const implementation = `0x${slot?.slice(-40)}` as Address;
  const implementationCode = await chainClient.getCode({
    address: implementation,
  });
  if (
    chainId !== ARC.id ||
    !code ||
    keccak256(code) !== env.ESCROW_CODE_HASH ||
    !same(implementation, MARKET.implementation) ||
    !implementationCode ||
    keccak256(implementationCode) !== env.ESCROW_IMPLEMENTATION_HASH ||
    !same(token, ARC.usdc) ||
    platform !== 0n ||
    evaluatorFee !== 0n
  )
    throw new MarketError('CONTRACT_CONFIGURATION_CHANGED', 503);
}

export async function verifyIdentity(env?: MarketEnv) {
  const args = [BigInt(MARKET.agentId)] as const;

  async function readIdentity(
    functionName: 'ownerOf' | 'getAgentWallet' | 'tokenURI',
  ) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await chainClient.readContract({
          address: MARKET.registry,
          abi: identityAbi,
          functionName,
          args,
        });
      } catch (error) {
        if (
          attempt >= 3 ||
          !(error instanceof Error) ||
          !/rate limit|defined limit/i.test(error.message)
        )
          throw error;
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
      }
    }
  }

  const owner = await readIdentity('ownerOf');
  const wallet = await readIdentity('getAgentWallet');
  const uri = await readIdentity('tokenURI');
  if (
    !same(owner, MARKET.provider) ||
    !same(wallet, MARKET.provider) ||
    uri !== `${MARKET.origin}/agent/registration.json`
  )
    throw new MarketError('AGENT_IDENTITY_CHANGED', 503);
  const metadata = env?.ASSETS
    ? await env.ASSETS.fetch(new Request(uri))
    : await fetch(uri, {
        signal: AbortSignal.timeout(8000),
        redirect: 'manual',
        cache: 'no-store',
      });
  if (!metadata.ok)
    throw new MarketError(`METADATA_HTTP_${metadata.status}`, 503);
  const parsed = z
    .object({
      services: z.array(z.object({ name: z.string(), endpoint: z.string() })),
    })
    .parse(await metadata.json());
  if (
    !metadata.ok ||
    parsed.services.find((s) => s.name === 'A2A')?.endpoint !==
      `${MARKET.origin}/.well-known/agent-card.json`
  )
    throw new MarketError('AGENT_ENDPOINT_CHANGED', 503);
}

export async function catalog(env: MarketEnv) {
  let indexedName: string | null = null;
  let stale = false;
  let discoveryReason = '';
  try {
    const response = await fetch(
      'https://trust8004.xyz/api/v1/catalog/agents/5042002:894552',
      { signal: AbortSignal.timeout(6000), redirect: 'manual' },
    );
    if (!response.ok)
      throw new MarketError(`DISCOVERY_HTTP_${response.status}`, 503);
    const data = z
      .object({
        agentId: z.literal('894552'),
        chainId: z.literal(5042002),
        contractAddress: z.string(),
        ownerAddress: z.string(),
        name: z.string(),
      })
      .parse(await response.json());
    if (
      !same(data.contractAddress, MARKET.registry) ||
      !same(data.ownerAddress, MARKET.provider)
    )
      throw new Error();
    indexedName = data.name;
    await env.DB.prepare(
      'INSERT INTO public_agent_cache(id,body,verified_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,verified_at=excluded.verified_at',
    )
      .bind('894552', JSON.stringify(data), Date.now())
      .run();
  } catch (error) {
    stale = true;
    discoveryReason =
      error instanceof MarketError ? error.code : 'DISCOVERY_PENDING';
    const cached = await env.DB.prepare(
      'SELECT body FROM public_agent_cache WHERE id=?',
    )
      .bind('894552')
      .first<{ body: string }>();
    indexedName = cached ? JSON.parse(cached.body).name : snapshot.name;
  }
  let identityVerified = false;
  let enabled = false;
  let availabilityReason = '';
  try {
    // Display-only cache. Every draft/create/fund still performs a fresh registry check.
    const verified = await env.DB.prepare(
      'SELECT verified_at FROM public_agent_cache WHERE id=?',
    )
      .bind('identity:894552')
      .first<{ verified_at: number }>();
    if (!verified || Date.now() - verified.verified_at > 30000) {
      await verifyIdentity(env);
      await env.DB.prepare(
        'INSERT INTO public_agent_cache(id,body,verified_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET verified_at=excluded.verified_at',
      )
        .bind('identity:894552', '{}', Date.now())
        .run();
    }
    identityVerified = true;
    await verifyMarket(env);
    enabled = true;
  } catch (error) {
    availabilityReason =
      error instanceof MarketError ? error.code : 'VERIFICATION_PENDING';
  }

  return {
    name: metadata.name,
    description: metadata.description,
    capabilities: metadata.capabilities,
    version: metadata.version,
    indexedName,
    image: metadata.image,
    agentId: MARKET.agentId,
    registry: MARKET.registry,
    wallet: MARKET.provider,
    walletExplorerUrl: `${arcTestnet.blockExplorers.default.url}/address/${MARKET.provider}`,
    chainId: ARC.id,
    price: env.JOB_PRICE_ATOMIC ?? MARKET.fee,
    stale,
    discoveryReason,
    identityVerified,
    enabled,
    availabilityReason,
    mode: 'CRE simulation',
    trustUrl: 'https://trust8004.xyz/agents/5042002:894552',
  };
}
