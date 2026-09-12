import {
  createPublicClient,
  http,
  decodeEventLog,
  type Hex,
  type Address,
} from 'viem';
import { ARC, probeReceiverAbi } from '@private-hire/chain';
import { probeKey } from '@private-hire/domain';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const [mode, hash, expectedProbe] = process.argv.slice(2);

if (
  !['deployment', 'report'].includes(mode) ||
  !/^0x[0-9a-fA-F]{64}$/.test(hash ?? '')
)
  throw new Error(
    'Usage: verify-receipt.ts deployment|report <txHash> [probeId]',
  );

const client = createPublicClient({ transport: http(ARC.rpc) });

if ((await client.getChainId()) !== ARC.id) throw new Error('Wrong chain');

const receipt = await client.getTransactionReceipt({ hash: hash as Hex });

if (receipt.status !== 'success') throw new Error('Transaction failed');

let evidence: Record<string, unknown>;

if (mode === 'deployment') {
  const receiver = receipt.contractAddress;
  if (!receiver || !(await client.getCode({ address: receiver })))
    throw new Error('Receiver missing');
  const forwarder = await client.readContract({
    address: receiver,
    abi: probeReceiverAbi,
    functionName: 'forwarder',
  });
  const simulationOnly = await client.readContract({
    address: receiver,
    abi: probeReceiverAbi,
    functionName: 'SIMULATION_ONLY',
  });
  if (
    forwarder.toLowerCase() !== ARC.mockForwarder.toLowerCase() ||
    !simulationOnly
  )
    throw new Error('Wrong receiver configuration');
  evidence = { receiver, forwarder, simulationOnly };
} else {
  if (!expectedProbe) throw new Error('probeId required');
  const config = JSON.parse(
    readFileSync('probe/config.staging.json', 'utf8'),
  ) as { receiver: Address };
  const events = receipt.logs
    .filter((l) => l.address.toLowerCase() === config.receiver.toLowerCase())
    .map((l) => ({
      index: l.logIndex,
      receiptEventIndex: receipt.logs.indexOf(l),
      event: decodeEventLog({
        abi: probeReceiverAbi,
        data: l.data,
        topics: l.topics,
      }),
    }));
  const match = events.find(
    (e) =>
      e.event.eventName === 'ProbeRecorded' &&
      e.event.args.probeId === probeKey(expectedProbe),
  );
  if (!match || match.event.eventName !== 'ProbeRecorded')
    throw new Error('Expected ProbeRecorded event missing');
  const decision = await client.readContract({
    address: config.receiver,
    abi: probeReceiverAbi,
    functionName: 'decisions',
    args: [probeKey(expectedProbe)],
  });
  if (decision !== match.event.args.decision)
    throw new Error('Stored decision mismatch');
  evidence = {
    receiver: config.receiver,
    event: match.event,
    logIndex: match.index,
    receiptEventIndex: match.receiptEventIndex,
    probeId: expectedProbe,
    decision,
  };
}

evidence = {
  ...evidence,
  mode:
    mode === 'report'
      ? 'CRE simulation + Arc testnet transaction; not live TEE'
      : 'simulation-only receiver deployment',
  chainId: ARC.id,
  transactionHash: hash,
  blockNumber: receipt.blockNumber.toString(),
  blockHash: receipt.blockHash,
  gasUsed: receipt.gasUsed.toString(),
  effectiveGasPriceWei: receipt.effectiveGasPrice.toString(),
  transactionFeeWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
};

mkdirSync('../../docs/evidence', { recursive: true });

writeFileSync(
  `../../docs/evidence/${mode}-${hash.slice(2, 14)}.json`,
  JSON.stringify(
    evidence,
    (_, v) => (typeof v === 'bigint' ? v.toString() : v),
    2,
  ) + '\n',
);

console.log(
  JSON.stringify(evidence, (_, v) =>
    typeof v === 'bigint' ? v.toString() : v,
  ),
);
