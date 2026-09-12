import {
  createPublicClient,
  http,
  keccak256,
  encodeDeployData,
  formatEther,
  type Hex,
} from 'viem';
import { arcTestnet } from 'viem/chains';
import { readFileSync, writeFileSync } from 'node:fs';
import { ARC, MARKET, escrowAbi } from '@private-hire/chain';

async function main() {
  const client = createPublicClient({ chain: arcTestnet, transport: http() });
  if ((await client.getChainId()) !== ARC.id) throw new Error('Wrong chain');
  const code = await client.getCode({ address: MARKET.escrow });
  const slot = await client.getStorageAt({
    address: MARKET.escrow,
    slot: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
  });
  if (
    slot?.slice(-40).toLowerCase() !==
    MARKET.implementation.slice(2).toLowerCase()
  )
    throw new Error('Implementation changed');
  const implementationCode = await client.getCode({
    address: MARKET.implementation,
  });
  if (!code || !implementationCode) throw new Error('Code missing');
  const token = await client.readContract({
    address: MARKET.escrow,
    abi: escrowAbi,
    functionName: 'paymentToken',
  });
  const platform = await client.readContract({
    address: MARKET.escrow,
    abi: escrowAbi,
    functionName: 'platformFeeBP',
  });
  const evaluator = await client.readContract({
    address: MARKET.escrow,
    abi: escrowAbi,
    functionName: 'evaluatorFeeBP',
  });
  if (
    token.toLowerCase() !== ARC.usdc.toLowerCase() ||
    platform !== 0n ||
    evaluator !== 0n
  )
    throw new Error('Token or fees changed');
  const artifact = JSON.parse(
    readFileSync(
      '../../packages/contracts/out/JobEvaluator.sol/JobEvaluator.json',
      'utf8',
    ),
  );
  const bytecode = (
    artifact.bytecode.object.startsWith('0x')
      ? artifact.bytecode.object
      : `0x${artifact.bytecode.object}`
  ) as Hex;
  const data = encodeDeployData({
    abi: artifact.abi,
    bytecode,
    args: [ARC.mockForwarder, MARKET.escrow],
  });
  const estimatedGas = await client.estimateGas({
    account: MARKET.provider,
    data,
    value: 0n,
  });
  const gasLimit = (estimatedGas * 120n + 99n) / 100n;
  const gasPrice = await client.getGasPrice();
  const review = {
    status: 'prepared-unsigned',
    chainId: ARC.id,
    escrow: MARKET.escrow,
    implementation: MARKET.implementation,
    escrowCodeHash: keccak256(code),
    implementationCodeHash: keccak256(implementationCode),
    platformFeeBP: '0',
    evaluatorFeeBP: '0',
    token,
    constructor: { mockForwarder: ARC.mockForwarder, escrow: MARKET.escrow },
    bytecodeHash: keccak256(bytecode),
    transaction: { from: MARKET.provider, data, value: '0' },
    estimatedGas: estimatedGas.toString(),
    gasLimit: gasLimit.toString(),
    gasPriceWei: gasPrice.toString(),
    estimatedFeeTestUsdc: formatEther(estimatedGas * gasPrice),
    maximumAtCurrentGasPriceTestUsdc: formatEther(gasLimit * gasPrice),
    balanceTestUsdc: formatEther(
      await client.getBalance({ address: MARKET.provider }),
    ),
  };
  writeFileSync(
    '../../docs/evidence/market-deployment-prepared.json',
    JSON.stringify(review, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      status: review.status,
      estimatedFeeTestUsdc: review.estimatedFeeTestUsdc,
      maximumFeeTestUsdc: review.maximumAtCurrentGasPriceTestUsdc,
    }),
  );
}

main().catch(() => {
  console.error('Market preparation failed; no transaction signed or sent.');
  process.exitCode = 1;
});
