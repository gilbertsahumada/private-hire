import {
  createPublicClient,
  createWalletClient,
  defineChain,
  getContractAddress,
  http,
  keccak256,
  parseEther,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ARC } from '@private-hire/chain';

async function main() {
  if (process.env.ALLOW_ARC_DEPLOY !== 'yes') {
    throw new Error('Explicit deployment authorization required.');
  }

  const pendingFile = '../../.local/receiver-deployment-submitted.json';
  if (existsSync(pendingFile)) {
    throw new Error(
      'Submission already recorded. Verify its receipt before any retry.',
    );
  }

  const env = Object.fromEntries(
    readFileSync('../../.env', 'utf8')
      .split('\n')
      .filter((line) => line.includes('=') && !line.trim().startsWith('#'))
      .map((line) => {
        const separator = line.indexOf('=');

        return [
          line.slice(0, separator).trim(),
          line.slice(separator + 1).trim(),
        ];
      }),
  );
  const account = privateKeyToAccount(env.CRE_ETH_PRIVATE_KEY as Hex);
  if (account.address !== env.ARC_WALLET_ADDRESS) {
    throw new Error('Wallet address mismatch.');
  }

  const prepared = JSON.parse(
    readFileSync('../../.local/receiver-deployment.json', 'utf8'),
  ) as { data: Hex; chainId: Hex; value: Hex };
  const artifact = JSON.parse(
    readFileSync(
      '../../packages/contracts/out/ProbeReceiver.sol/ProbeReceiver.json',
      'utf8',
    ),
  );
  const bytecode: string = artifact.bytecode.object;
  const expectedData =
    (bytecode.startsWith('0x') ? bytecode : `0x${bytecode}`) +
    ARC.mockForwarder.slice(2).toLowerCase().padStart(64, '0');
  if (
    prepared.data !== expectedData ||
    BigInt(prepared.chainId) !== BigInt(ARC.id) ||
    BigInt(prepared.value) !== 0n
  ) {
    throw new Error(
      'Prepared deployment does not match the reviewed artifact.',
    );
  }

  const chain = defineChain({
    id: ARC.id,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [ARC.rpc] } },
  });
  const client = createPublicClient({ chain, transport: http() });
  if ((await client.getChainId()) !== ARC.id) {
    throw new Error('Wrong network.');
  }
  const estimatedGas = await client.estimateGas({
    account,
    data: prepared.data,
    value: 0n,
  });
  const gas = (estimatedGas * 120n + 99n) / 100n;
  const gasPrice = await client.getGasPrice();
  const maximumCost = gas * gasPrice;
  if (maximumCost > parseEther('0.02')) {
    throw new Error('Gas cost exceeds the authorized 0.02 test USDC limit.');
  }
  if ((await client.getBalance({ address: account.address })) < maximumCost) {
    throw new Error('Insufficient test USDC.');
  }

  const nonce = await client.getTransactionCount({
    address: account.address,
    blockTag: 'pending',
  });
  const receiver = getContractAddress({
    from: account.address,
    nonce: BigInt(nonce),
  });
  const wallet = createWalletClient({ account, chain, transport: http() });
  const serialized = await wallet.signTransaction({
    account,
    chain,
    data: prepared.data,
    value: 0n,
    nonce,
    gas,
    gasPrice,
    type: 'legacy',
  });
  const transactionHash = keccak256(serialized);
  // Persist the expected hash before submission so an uncertain response cannot
  // cause an accidental second deployment. Never persist or print the signer key.
  writeFileSync(
    pendingFile,
    JSON.stringify(
      {
        transactionHash,
        receiver,
        sender: account.address,
        chainId: ARC.id,
        gas: gas.toString(),
        gasPrice: gasPrice.toString(),
        maximumCostWei: maximumCost.toString(),
        status: 'signed; submission may be pending',
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  const hash = await client.sendRawTransaction({
    serializedTransaction: serialized,
  });
  console.log(
    JSON.stringify({
      transactionHash: hash,
      receiver,
      maximumCostWei: maximumCost.toString(),
    }),
  );
}

main().catch(() => {
  console.error(
    'Deployment stopped. Inspect the public submission record and RPC receipt before retrying. No secret error details were printed.',
  );
  process.exitCode = 1;
});
