import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  http,
  keccak256,
  parseAbi,
  parseEther,
  parseEventLogs,
  type Address,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet } from 'viem/chains';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const registry = '0x8004A818BFB912233c491871b3d84c89A494BD9e' as const;

const abi = parseAbi([
  'function register(string agentURI) returns (uint256 agentId)',
  'function balanceOf(address owner) view returns (uint256)',
  'function ownerOf(uint256 agentId) view returns (address)',
  'function tokenURI(uint256 agentId) view returns (string)',
  'function getAgentWallet(uint256 agentId) view returns (address)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
]);

const pendingFile = '../../.local/identity-registration-submitted.json';

async function main() {
  const prepared = JSON.parse(
    readFileSync(
      '../../docs/evidence/identity-registration-prepared.json',
      'utf8',
    ),
  );
  const client = createPublicClient({ chain: arcTestnet, transport: http() });
  if ((await client.getChainId()) !== 5042002) throw new Error('Wrong chain');

  let hash: Hex;
  if (existsSync(pendingFile)) {
    // Recovery is read-only. Never mint a second identity after an uncertain send.
    hash = JSON.parse(readFileSync(pendingFile, 'utf8')).transactionHash;
  } else {
    if (process.env.ALLOW_IDENTITY_REGISTRATION !== 'yes') {
      throw new Error('Explicit registration authorization required');
    }

    const metadata = readFileSync('../web/public/agent/registration.json');
    const published = execFileSync('curl', [
      '--fail',
      '--silent',
      '--show-error',
      '--max-time',
      '30',
      prepared.agentURI,
    ]);
    if (
      !metadata.equals(published) ||
      keccak256(metadata) !== prepared.metadataHash
    ) {
      throw new Error('Metadata changed');
    }

    const code = await client.getCode({ address: registry });
    const slot = await client.getStorageAt({
      address: registry,
      slot: '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc',
    });
    const implementation = `0x${slot?.slice(-40)}` as Address;
    const implementationCode = await client.getCode({
      address: implementation,
    });
    if (
      !code ||
      keccak256(code) !== prepared.registryCodeHash ||
      implementation !== prepared.implementation ||
      !implementationCode ||
      keccak256(implementationCode) !== prepared.implementationCodeHash
    ) {
      throw new Error('Registry changed');
    }

    const env = readFileSync('../../.env', 'utf8');
    const key = /^CRE_ETH_PRIVATE_KEY=(0x[0-9a-fA-F]{64})\s*$/m.exec(env)?.[1];
    if (!key) throw new Error('Missing dedicated signer');
    const account = privateKeyToAccount(key as Hex);
    if (account.address !== prepared.account) throw new Error('Wrong signer');
    if (
      (await client.readContract({
        address: registry,
        abi,
        functionName: 'balanceOf',
        args: [account.address],
      })) !== 0n
    ) {
      throw new Error('Existing identity requires inspection');
    }

    const data = encodeFunctionData({
      abi,
      functionName: 'register',
      args: [prepared.agentURI],
    });
    if (
      prepared.chainId !== 5042002 ||
      prepared.registry !== registry ||
      prepared.transaction.to !== registry ||
      prepared.transaction.data !== data ||
      prepared.transaction.value !== '0'
    )
      throw new Error('Proposal mismatch');

    await client.simulateContract({
      account,
      address: registry,
      abi,
      functionName: 'register',
      args: [prepared.agentURI],
    });
    const estimate = await client.estimateGas({
      account,
      to: registry,
      data,
      value: 0n,
    });
    const gas = (estimate * 120n + 99n) / 100n;
    const gasPrice = await client.getGasPrice();
    if (gas * gasPrice > parseEther('0.006'))
      throw new Error('Authorized fee cap exceeded');
    if (
      (await client.getBalance({ address: account.address })) <
      gas * gasPrice
    )
      throw new Error('Insufficient balance');
    const nonce = await client.getTransactionCount({
      address: account.address,
      blockTag: 'pending',
    });
    const wallet = createWalletClient({
      account,
      chain: arcTestnet,
      transport: http(),
    });
    const serialized = await wallet.signTransaction({
      account,
      chain: arcTestnet,
      to: registry,
      data,
      value: 0n,
      nonce,
      gas,
      gasPrice,
      type: 'legacy',
    });
    hash = keccak256(serialized);
    writeFileSync(
      pendingFile,
      JSON.stringify(
        {
          transactionHash: hash,
          chainId: 5042002,
          registry,
          account: account.address,
          maximumFeeTestUsdc: formatEther(gas * gasPrice),
        },
        null,
        2,
      ) + '\n',
      { flag: 'wx', mode: 0o600 },
    );
    await client.sendRawTransaction({ serializedTransaction: serialized });
  }

  const receipt = await client.waitForTransactionReceipt({
    hash,
    timeout: 60_000,
  });
  if (
    receipt.status !== 'success' ||
    receipt.to?.toLowerCase() !== registry.toLowerCase() ||
    receipt.from.toLowerCase() !== prepared.account.toLowerCase()
  )
    throw new Error('Receipt mismatch');
  const events = parseEventLogs({
    abi,
    eventName: 'Registered',
    logs: receipt.logs.filter(
      (log) => log.address.toLowerCase() === registry.toLowerCase(),
    ),
  });
  if (events.length !== 1) throw new Error('Missing registration event');
  const { agentId, agentURI, owner } = events[0].args;
  if (
    agentURI !== prepared.agentURI ||
    owner.toLowerCase() !== prepared.account.toLowerCase()
  )
    throw new Error('Registration mismatch');
  const currentOwner = await client.readContract({
    address: registry,
    abi,
    functionName: 'ownerOf',
    args: [agentId],
  });
  const currentURI = await client.readContract({
    address: registry,
    abi,
    functionName: 'tokenURI',
    args: [agentId],
  });
  const agentWallet = await client.readContract({
    address: registry,
    abi,
    functionName: 'getAgentWallet',
    args: [agentId],
  });
  if (
    currentOwner.toLowerCase() !== owner.toLowerCase() ||
    agentWallet.toLowerCase() !== owner.toLowerCase() ||
    currentURI !== agentURI
  )
    throw new Error('Onchain identity mismatch');
  const evidence = {
    status: 'confirmed',
    chainId: 5042002,
    registry,
    transactionHash: hash,
    blockNumber: receipt.blockNumber.toString(),
    agentId: agentId.toString(),
    agentRegistry: `eip155:5042002:${registry}`,
    owner: currentOwner,
    agentWallet,
    agentURI,
    feeTestUsdc: formatEther(receipt.gasUsed * receipt.effectiveGasPrice),
    remainingBalanceTestUsdc: formatEther(
      await client.getBalance({ address: currentOwner }),
    ),
  };
  writeFileSync(
    '../../docs/evidence/identity-registration-confirmed.json',
    JSON.stringify(evidence, null, 2) + '\n',
  );
  console.log(JSON.stringify(evidence, null, 2));
}

main().catch(() => {
  console.error(
    'Registration stopped. Inspect the submission record and receipt before retrying; secrets are not logged.',
  );
  process.exitCode = 1;
});
