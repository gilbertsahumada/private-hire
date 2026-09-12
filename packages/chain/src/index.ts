import {
  encodeAbiParameters,
  parseAbiParameters,
  type Address,
  type Hex,
} from 'viem';

export const ARC = {
  id: 5042002,
  selector: '3034092155422581607',
  rpc: 'https://rpc.testnet.arc.io',
  usdc: '0x3600000000000000000000000000000000000000',
  forwarder: '0x76c9cf548b4179F8901cda1f8623568b58215E62',
  mockForwarder: '0x6E9EE680ef59ef64Aa8C7371279c27E496b5eDc1',
} as const;

export const reportParams = parseAbiParameters(
  'uint256 schemaVersion, uint256 chainId, address receiver, bytes32 probeId, bytes32 resultHash, uint8 decision, uint256 validUntil',
);

export function encodeReport(r: {
  receiver: Address;
  probeId: Hex;
  resultHash: Hex;
  decision: 1 | 2;
  validUntil: bigint;
}): Hex {
  return encodeAbiParameters(reportParams, [
    1n,
    BigInt(ARC.id),
    r.receiver,
    r.probeId,
    r.resultHash,
    r.decision,
    r.validUntil,
  ]);
}

export { probeReceiverAbi } from './probe-abi.js';

export * from './market.js';
