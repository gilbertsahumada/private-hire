import {
  parseAbi,
  parseAbiParameters,
  encodeAbiParameters,
  type Address,
  type Hex,
} from 'viem';

export const MARKET = {
  escrow: '0x0747EEf0706327138c69792bF28Cd525089e4583',
  implementation: '0xA316fd02827242D537F84730F8a37D0BA5fd351a',
  registry: '0x8004A818BFB912233c491871b3d84c89A494BD9e',
  provider: '0x0C68C8D018ba72C33e966498B2148dC2af454645',
  agentId: '894552',
  origin: 'https://confidential-agent-jobs-staging.gilbertsahumada.workers.dev',
  fee: '10000',
} as const;

// Interface inspected against Arc's verified AgenticCommerce implementation.
export const escrowAbi = parseAbi([
  'function createJob(address provider,address evaluator,uint256 expiredAt,string description,address hook) returns (uint256)',
  'function setBudget(uint256 jobId,uint256 amount,bytes optParams)',
  'function fund(uint256 jobId,bytes optParams)',
  'function submit(uint256 jobId,bytes32 deliverable,bytes optParams)',
  'function complete(uint256 jobId,bytes32 reason,bytes optParams)',
  'function reject(uint256 jobId,bytes32 reason,bytes optParams)',
  'function claimRefund(uint256 jobId)',
  'function getJob(uint256 jobId) view returns ((uint256 id,address client,address provider,address evaluator,string description,uint256 budget,uint256 expiredAt,uint8 status,address hook))',
  'function paymentToken() view returns (address)',
  'function platformFeeBP() view returns (uint256)',
  'function evaluatorFeeBP() view returns (uint256)',
  'event JobCreated(uint256 indexed jobId,address indexed client,address indexed provider,address evaluator,uint256 expiredAt,address hook)',
  'event BudgetSet(uint256 indexed jobId,uint256 amount)',
  'event JobFunded(uint256 indexed jobId,address indexed client,uint256 amount)',
  'event JobSubmitted(uint256 indexed jobId,address indexed provider,bytes32 deliverable)',
  'event JobCompleted(uint256 indexed jobId,address indexed evaluator,bytes32 reason)',
  'event JobRejected(uint256 indexed jobId,address indexed rejector,bytes32 reason)',
  'event JobExpired(uint256 indexed jobId)',
  'event PaymentReleased(uint256 indexed jobId,address indexed provider,uint256 amount)',
  'event Refunded(uint256 indexed jobId,address indexed client,uint256 amount)',
]);

export const identityAbi = parseAbi([
  'function ownerOf(uint256 agentId) view returns (address)',
  'function getAgentWallet(uint256 agentId) view returns (address)',
  'function tokenURI(uint256 agentId) view returns (string)',
]);

export const evaluationParams = parseAbiParameters(
  'uint256 schemaVersion,uint256 chainId,address escrow,address receiver,uint256 jobId,bytes32 manifestHash,bytes32 deliverableHash,uint8 decision,uint256 validUntil',
);

export function encodeEvaluation(r: {
  receiver: Address;
  jobId: bigint;
  manifestHash: Hex;
  deliverableHash: Hex;
  decision: 1 | 2;
  validUntil: bigint;
}) {
  return encodeAbiParameters(evaluationParams, [
    1n,
    5042002n,
    MARKET.escrow,
    r.receiver,
    r.jobId,
    r.manifestHash,
    r.deliverableHash,
    r.decision,
    r.validUntil,
  ]);
}
