import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  encodeDeployData,
  getContractAddress,
  parseEther,
  formatEther,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ARC, MARKET, arcChain, escrowAbi } from '@private-hire/chain';

const pendingFile = '../../.local/job-evaluator-submitted.json';

const evidenceFile = '../../docs/evidence/job-evaluator-deployment.json';

const client = createPublicClient({
  chain: arcChain,
  transport: http(ARC.rpc),
});

const proposal = JSON.parse(
  readFileSync('../../docs/evidence/market-deployment-prepared.json', 'utf8'),
);

const artifact = JSON.parse(
  readFileSync(
    '../../packages/contracts/out/JobEvaluator.sol/JobEvaluator.json',
    'utf8',
  ),
);

const bytecode = artifact.bytecode.object as Hex;

const data = encodeDeployData({
  abi: artifact.abi,
  bytecode,
  args: [ARC.mockForwarder, MARKET.escrow],
});

async function verify(hash: Hex) {
  const receipt = await client.waitForTransactionReceipt({
    hash,
    timeout: 60000,
  });
  const tx = await client.getTransaction({ hash });
  if (
    receipt.status !== 'success' ||
    !receipt.contractAddress ||
    tx.input !== data ||
    tx.value !== 0n ||
    tx.from.toLowerCase() !== MARKET.provider.toLowerCase()
  )
    throw new Error('Unexpected deployment receipt');
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  if (block.hash !== receipt.blockHash)
    throw new Error('Receipt is not canonical');
  const address = receipt.contractAddress;
  const code = await client.getCode({ address });
  if (!code || code === '0x') throw new Error('Runtime missing');
  let expected = artifact.deployedBytecode.object.slice(2);
  let actual = code.slice(2);
  if (expected.length !== actual.length)
    throw new Error('Runtime length mismatch');
  for (const ranges of Object.values(
    artifact.deployedBytecode.immutableReferences,
  ) as { start: number; length: number }[][]) {
    for (const r of ranges) {
      expected =
        expected.slice(0, r.start * 2) +
        '0'.repeat(r.length * 2) +
        expected.slice((r.start + r.length) * 2);
      actual =
        actual.slice(0, r.start * 2) +
        '0'.repeat(r.length * 2) +
        actual.slice((r.start + r.length) * 2);
    }
  }
  if (expected !== actual) throw new Error('Runtime artifact mismatch');
  const forwarder = await client.readContract({
    address,
    abi: artifact.abi,
    functionName: 'forwarder',
  });
  const escrow = await client.readContract({
    address,
    abi: artifact.abi,
    functionName: 'escrow',
  });
  const simulation = await client.readContract({
    address,
    abi: artifact.abi,
    functionName: 'SIMULATION_ONLY',
  });
  const erc165 = await client.readContract({
    address,
    abi: artifact.abi,
    functionName: 'supportsInterface',
    args: ['0x01ffc9a7'],
  });
  if (
    String(forwarder).toLowerCase() !== ARC.mockForwarder.toLowerCase() ||
    String(escrow).toLowerCase() !== MARKET.escrow.toLowerCase() ||
    simulation !== true ||
    erc165 !== true
  )
    throw new Error('Receiver configuration mismatch');
  const fee = receipt.gasUsed * receipt.effectiveGasPrice;
  if (fee > parseEther('0.02')) throw new Error('Fee exceeds authorization');
  const result = {
    status: 'confirmed',
    chainId: ARC.id,
    transactionHash: hash,
    address,
    blockNumber: receipt.blockNumber.toString(),
    blockHash: receipt.blockHash,
    sender: tx.from,
    constructor: { mockForwarder: forwarder, escrow },
    simulationOnly: simulation,
    runtimeCodeHash: keccak256(code),
    bytecodeHash: keccak256(bytecode),
    artifactRuntimeVerified: true,
    gasUsed: receipt.gasUsed.toString(),
    effectiveGasPrice: receipt.effectiveGasPrice.toString(),
    feeTestUsdc: formatEther(fee),
    authorizedMaximumTestUsdc: '0.02',
    scope:
      'Arc testnet evaluator deployment; no job transaction or CRE broadcast',
  };
  writeFileSync(evidenceFile, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}

async function main() {
  if (
    (await client.getChainId()) !== ARC.id ||
    proposal.chainId !== ARC.id ||
    proposal.transaction.data !== data ||
    keccak256(bytecode) !== proposal.bytecodeHash ||
    proposal.transaction.value !== '0'
  )
    throw new Error('Prepared artifact mismatch');
  if (existsSync(pendingFile)) {
    await verify(JSON.parse(readFileSync(pendingFile, 'utf8')).transactionHash);

    return;
  }
  if (process.env.ALLOW_JOB_EVALUATOR_DEPLOY !== 'yes')
    throw new Error('Explicit authorization required');
  const code = await client.getCode({ address: MARKET.escrow });
  const slot = await client.getStorageAt({
    address: MARKET.escrow,
    slot: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
  });
  const implementation = await client.getCode({
    address: MARKET.implementation,
  });
  if (
    !code ||
    keccak256(code) !== proposal.escrowCodeHash ||
    !implementation ||
    keccak256(implementation) !== proposal.implementationCodeHash ||
    slot?.slice(-40).toLowerCase() !==
      MARKET.implementation.slice(2).toLowerCase()
  )
    throw new Error('Escrow code changed');
  for (const name of ['platformFeeBP', 'evaluatorFeeBP'] as const)
    if (
      (await client.readContract({
        address: MARKET.escrow,
        abi: escrowAbi,
        functionName: name,
      })) !== 0n
    )
      throw new Error('Fees changed');
  if (
    (
      await client.readContract({
        address: MARKET.escrow,
        abi: escrowAbi,
        functionName: 'paymentToken',
      })
    ).toLowerCase() !== ARC.usdc.toLowerCase()
  )
    throw new Error('Token changed');
  const env = Object.fromEntries(
    readFileSync('../../.env', 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.startsWith('#'))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i), l.slice(i + 1).trim()];
      }),
  );
  const account = privateKeyToAccount(env.CRE_ETH_PRIVATE_KEY as Hex);
  if (
    account.address.toLowerCase() !== MARKET.provider.toLowerCase() ||
    account.address.toLowerCase() !== env.ARC_WALLET_ADDRESS.toLowerCase()
  )
    throw new Error('Signer mismatch');
  const estimate = await client.estimateGas({ account, data, value: 0n });
  const gas = (estimate * 120n + 99n) / 100n;
  const gasPrice = await client.getGasPrice();
  if (
    gas * gasPrice > parseEther('0.02') ||
    (await client.getBalance({ address: account.address })) < gas * gasPrice
  )
    throw new Error('Cost limit or balance');
  const nonce = await client.getTransactionCount({
    address: account.address,
    blockTag: 'pending',
  });
  const wallet = createWalletClient({
    account,
    chain: arcChain,
    transport: http(ARC.rpc),
  });
  const signed = await wallet.signTransaction({
    account,
    chain: arcChain,
    type: 'legacy',
    nonce,
    gas,
    gasPrice,
    data,
    value: 0n,
  });
  const transactionHash = keccak256(signed);
  writeFileSync(
    pendingFile,
    JSON.stringify(
      {
        transactionHash,
        address: getContractAddress({
          from: account.address,
          nonce: BigInt(nonce),
        }),
        maximumFeeTestUsdc: formatEther(gas * gasPrice),
        status: 'signed; submission may be pending',
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  const hash = await client.sendRawTransaction({
    serializedTransaction: signed,
  });
  if (hash !== transactionHash)
    throw new Error('Hash mismatch; verify pending record');
  console.log(JSON.stringify({ status: 'submitted', transactionHash }));
  await verify(hash);
}

main().catch(() => {
  console.error(
    'Deployment or verification stopped. Inspect the public pending record before retrying. No additional transaction is automatically sent.',
  );
  process.exitCode = 1;
});
