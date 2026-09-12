import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  createPublicClient,
  http,
  formatEther,
  formatUnits,
  erc20Abi,
  isAddress,
  keccak256,
} from 'viem';
import { ARC, arcChain } from '@private-hire/chain';

const { verifyMarket, verifyIdentity } = createRequire(import.meta.url)(
  '../../web/src/lib/catalog.ts',
) as typeof import('../../web/src/lib/catalog');

import type { MarketEnv } from '../../web/src/lib/market-env';

async function main() {
  const deployment = JSON.parse(
    readFileSync('../../docs/evidence/job-evaluator-deployment.json', 'utf8'),
  );
  const proposal = JSON.parse(
    readFileSync('../../docs/evidence/market-deployment-prepared.json', 'utf8'),
  );
  await verifyMarket({
    JOBS_ENABLED: 'true',
    JOB_EVALUATOR: deployment.address,
    JOB_EVALUATOR_CODE_HASH: deployment.runtimeCodeHash,
    ESCROW_CODE_HASH: proposal.escrowCodeHash,
    ESCROW_IMPLEMENTATION_HASH: proposal.implementationCodeHash,
  } as MarketEnv);
  await verifyIdentity();
  const client = createPublicClient({
    chain: arcChain,
    transport: http(ARC.rpc),
  });
  const alternate = createPublicClient({
    chain: arcChain,
    transport: http('https://rpc.blockdaemon.testnet.arc.network'),
  });
  if ((await alternate.getChainId()) !== ARC.id)
    throw new Error('Wrong fallback chain');
  const code = await alternate.getCode({ address: deployment.address });
  const receipt = await alternate.getTransactionReceipt({
    hash: deployment.transactionHash,
  });
  if (
    !code ||
    keccak256(code) !== deployment.runtimeCodeHash ||
    receipt.blockHash !== deployment.blockHash
  )
    throw new Error('Fallback state mismatch');
  const buyer = process.env.MARKET_BUYER;
  if (buyer && isAddress(buyer)) {
    const native = await client.getBalance({ address: buyer });
    const token = await client.readContract({
      address: ARC.usdc,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [buyer],
    });
    console.log(
      JSON.stringify({
        buyer,
        nativeTestUsdc: formatEther(native),
        erc20TestUsdc: formatUnits(token, 6),
      }),
    );
  }
  console.log(
    JSON.stringify({
      fallbackChecks: true,
      contractChecks: true,
      identityChecks: true,
      mode: 'read-only',
      receiver: deployment.address,
    }),
  );
}

main().catch(() => {
  console.error(
    'Market preflight pending: registry or contract verification failed. No transaction was prepared or signed.',
  );
  process.exitCode = 1;
});
