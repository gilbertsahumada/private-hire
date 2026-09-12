import {
  createPublicClient,
  encodeFunctionData,
  formatEther,
  http,
  keccak256,
  parseAbi,
  type Address,
} from 'viem';
import { arcTestnet } from 'viem/chains';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { ARC } from '@private-hire/chain';

// Read-only preparation: no private key, wallet client, signing or broadcast.
const registry = '0x8004A818BFB912233c491871b3d84c89A494BD9e' as const;

const agentURI =
  'https://confidential-agent-jobs-staging.gilbertsahumada.workers.dev/agent/registration.json';

const abi = parseAbi([
  'function register(string agentURI) returns (uint256 agentId)',
  'function balanceOf(address owner) view returns (uint256)',
  'function supportsInterface(bytes4 interfaceId) view returns (bool)',
]);

async function main() {
  const bytes = readFileSync('../web/public/agent/registration.json');
  const metadata = JSON.parse(bytes.toString());
  const walletService = metadata.services.find(
    (service: { name: string }) => service.name === 'wallet',
  );
  const walletMatch = /^eip155:5042002:(0x[0-9a-fA-F]{40})$/.exec(
    walletService?.endpoint ?? '',
  );
  if (!walletMatch || metadata.registrations.length !== 0) {
    throw new Error(
      'Review wallet and existing registration before proceeding.',
    );
  }

  const account = walletMatch[1] as Address;
  const published = execFileSync('curl', [
    '--fail',
    '--silent',
    '--show-error',
    '--max-time',
    '30',
    agentURI,
  ]);
  if (!bytes.equals(published)) {
    throw new Error('Published metadata differs from the reviewed local file.');
  }

  const client = createPublicClient({
    chain: arcTestnet,
    transport: http(ARC.rpc, { timeout: 20_000 }),
  });
  if ((await client.getChainId()) !== ARC.id) {
    throw new Error('Wrong network.');
  }

  const blockNumber = await client.getBlockNumber();
  const code = await client.getCode({ address: registry, blockNumber });
  if (!code || code === '0x') throw new Error('Registry has no code.');

  const implementationSlot = await client.getStorageAt({
    address: registry,
    slot: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
    blockNumber,
  });
  const implementation = implementationSlot
    ? (`0x${implementationSlot.slice(-40)}` as Address)
    : undefined;
  const implementationCode = implementation
    ? await client.getCode({ address: implementation, blockNumber })
    : undefined;
  const owned = await client.readContract({
    address: registry,
    abi,
    functionName: 'balanceOf',
    args: [account],
    blockNumber,
  });
  if (owned !== 0n) {
    throw new Error(
      'Wallet already owns identities. Inspect them before registering.',
    );
  }

  for (const interfaceId of ['0x80ac58cd', '0x5b5e139f'] as const) {
    if (
      !(await client.readContract({
        address: registry,
        abi,
        functionName: 'supportsInterface',
        args: [interfaceId],
        blockNumber,
      }))
    ) {
      throw new Error('Expected ERC-721 metadata interfaces not supported.');
    }
  }

  await client.simulateContract({
    account,
    address: registry,
    abi,
    functionName: 'register',
    args: [agentURI],
    blockNumber,
  });

  const data = encodeFunctionData({
    abi,
    functionName: 'register',
    args: [agentURI],
  });
  const estimatedGas = await client.estimateGas({
    account,
    to: registry,
    data,
    value: 0n,
  });
  const gasLimit = (estimatedGas * 120n + 99n) / 100n;
  const gasPrice = await client.getGasPrice();
  const balance = await client.getBalance({ address: account });
  if (balance < gasLimit * gasPrice)
    throw new Error('Insufficient gas balance.');

  const review = {
    status: 'prepared-unsigned-awaiting-authorization',
    checkedAt: new Date().toISOString(),
    blockNumber: blockNumber.toString(),
    chainId: ARC.id,
    registry,
    registryCodeHash: keccak256(code),
    implementation,
    implementationCodeHash:
      implementationCode && implementationCode !== '0x'
        ? keccak256(implementationCode)
        : null,
    account,
    currentlyOwnedIdentities: owned.toString(),
    agentURI,
    metadataHash: keccak256(bytes),
    simulation: 'register(string) succeeded via eth_call; no identity minted',
    transaction: {
      from: account,
      to: registry,
      data,
      value: '0',
      chainId: ARC.id,
    },
    gas: {
      estimatedGas: estimatedGas.toString(),
      proposedGasLimit: gasLimit.toString(),
      gasPriceWei: gasPrice.toString(),
      estimatedFeeTestUsdc: formatEther(estimatedGas * gasPrice),
      proposedMaximumAtCurrentGasPriceTestUsdc: formatEther(
        gasLimit * gasPrice,
      ),
      walletBalanceTestUsdc: formatEther(balance),
    },
    source: 'https://docs.arc.io/arc/tutorials/register-your-first-ai-agent',
  };
  writeFileSync(
    '../../docs/evidence/identity-registration-prepared.json',
    JSON.stringify(review, null, 2) + '\n',
  );
  console.log(
    JSON.stringify(
      { status: review.status, account, registry, gas: review.gas },
      null,
      2,
    ),
  );
}

main().catch(() => {
  console.error(
    'Identity preparation failed. No transaction was signed or sent.',
  );
  process.exitCode = 1;
});
