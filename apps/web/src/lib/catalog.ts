import { createPublicClient, http, keccak256, type Address } from 'viem';
import { arcTestnet } from 'viem/chains';
import { ARC, MARKET, escrowAbi, identityAbi } from '@private-hire/chain';
import { z } from 'zod';
import { type MarketEnv, MarketError } from './market-env';

export const chainClient = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC.rpc, { timeout: 10_000 }),
});

export const same = (a: string, b: string) =>
  a.toLowerCase() === b.toLowerCase();

export async function verifyMarket(env: MarketEnv) {
  if (
    env.JOBS_ENABLED !== 'true' ||
    !env.JOB_EVALUATOR ||
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

export async function verifyIdentity() {
  const args = [BigInt(MARKET.agentId)] as const;
  const [owner, wallet, uri] = await Promise.all([
    chainClient.readContract({
      address: MARKET.registry,
      abi: identityAbi,
      functionName: 'ownerOf',
      args,
    }),
    chainClient.readContract({
      address: MARKET.registry,
      abi: identityAbi,
      functionName: 'getAgentWallet',
      args,
    }),
    chainClient.readContract({
      address: MARKET.registry,
      abi: identityAbi,
      functionName: 'tokenURI',
      args,
    }),
  ]);
  if (
    !same(owner, MARKET.provider) ||
    !same(wallet, MARKET.provider) ||
    uri !== `${MARKET.origin}/agent/registration.json`
  )
    throw new MarketError('AGENT_IDENTITY_CHANGED', 503);
  const metadata = await fetch(uri, {
    signal: AbortSignal.timeout(8000),
    redirect: 'error',
    cache: 'no-store',
  });
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
  try {
    const response = await fetch(
      'https://trust8004.xyz/api/v1/catalog/agents/5042002:894552',
      { signal: AbortSignal.timeout(6000), redirect: 'error' },
    );
    if (!response.ok) throw new Error();
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
  } catch {
    stale = true;
    const cached = await env.DB.prepare(
      'SELECT body FROM public_agent_cache WHERE id=?',
    )
      .bind('894552')
      .first<{ body: string }>();
    indexedName = cached ? JSON.parse(cached.body).name : null;
  }
  let identityVerified = false;
  let enabled = false;
  try {
    await verifyIdentity();
    identityVerified = true;
    await verifyMarket(env);
    enabled = true;
  } catch {
    /* Expose availability independently from public discovery. */
  }

  return {
    name: 'Portfolio Calculator',
    indexedName,
    image: '/agent/portfolio-calculator.svg',
    agentId: MARKET.agentId,
    registry: MARKET.registry,
    wallet: MARKET.provider,
    chainId: ARC.id,
    price: env.JOB_PRICE_ATOMIC ?? MARKET.fee,
    stale,
    identityVerified,
    enabled,
    mode: 'CRE simulation',
    trustUrl: 'https://trust8004.xyz/agents/5042002:894552',
  };
}
