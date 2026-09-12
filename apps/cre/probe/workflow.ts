import {
  cre,
  bytesToHex,
  hexToBase64,
  type TeeRuntime,
  type Runtime,
  type HTTPPayload,
  type EVMLog,
} from '@chainlink/cre-sdk';
import { EVM_PB } from '@chainlink/cre-sdk/pb';
import { z } from 'zod';
import {
  decodeAbiParameters,
  encodeFunctionData,
  parseAbi,
  keccak256,
  toHex,
  type Address,
  type Hex,
} from 'viem';
import {
  commitment,
  contextSchema,
  evaluate,
  probeIdSchema,
  probeKey,
  verifyEnvelope,
} from '@private-hire/domain';
import {
  requestJson,
  sendAgentMessage,
  getAgentTask,
} from '@private-hire/agent-transport/tee';
import { ARC, encodeReport } from '@private-hire/chain';

export const configSchema = z.strictObject({
  origin: z.string(),
  allowLocalHttp: z.boolean(),
  receiver: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  writeReport: z.boolean(),
});

type Config = z.infer<typeof configSchema>;

export function onProbe(
  runtime: TeeRuntime<Config>,
  payload: HTTPPayload,
): string {
  try {
    const { probeId } = z
      .strictObject({ probeId: probeIdSchema })
      .parse(JSON.parse(new TextDecoder().decode(payload.input)));
    const contextToken = runtime
      .getSecret({ id: 'CONTEXT_TOKEN' })
      .result().value;
    const agentToken = runtime.getSecret({ id: 'A2A_TOKEN' }).result().value;
    const context = contextSchema.parse(
      requestJson(
        runtime,
        runtime.config,
        `/api/internal/probes/${probeId}/context`,
        contextToken,
      ),
    );
    if (
      context.probeId !== probeId ||
      context.input.requestId !== probeId ||
      commitment('input', context.input) !== context.inputHash ||
      context.validUntil <= Math.floor(runtime.now().getTime() / 1000)
    )
      throw new Error('CONTEXT_PENDING');
    const taskId = sendAgentMessage(
      runtime,
      runtime.config,
      agentToken,
      probeId,
      context.input,
    );
    const result = getAgentTask(runtime, runtime.config, agentToken, taskId);
    const envelope = verifyEnvelope(
      result.envelope,
      probeId,
      context.inputHash,
      result.resultHash,
    );
    const decision = evaluate(context.input, context.policy, envelope.result);
    const don = runtime.usingTheDons();
    const evm = new cre.capabilities.EVMClient(BigInt(ARC.selector));
    const decimalsCall = evm
      .callContract(don, {
        call: {
          to: hexToBase64(ARC.usdc),
          data: hexToBase64(
            encodeFunctionData({
              abi: parseAbi(['function decimals() view returns (uint8)']),
              functionName: 'decimals',
            }),
          ),
        },
      })
      .result();
    const [decimals] = decodeAbiParameters(
      [{ type: 'uint8' }],
      bytesToHex(decimalsCall.data),
    );
    if (decimals !== 6) throw new Error('ARC_READ_PENDING');
    if (!runtime.config.writeReport)
      return `SIMULATION_TRANSPORT_ONLY decision=${decision} arcDecimals=${decimals}`;
    if (/^0x0{40}$/i.test(runtime.config.receiver))
      throw new Error('RECEIVER_NOT_CONFIGURED');
    const report = don
      .report({
        encodedPayload: hexToBase64(
          encodeReport({
            receiver: runtime.config.receiver as Address,
            probeId: probeKey(probeId),
            resultHash: result.resultHash as Hex,
            decision,
            validUntil: BigInt(context.validUntil),
          }),
        ),
        encoderName: 'evm',
        signingAlgo: 'ecdsa',
        hashingAlgo: 'keccak256',
      })
      .result();
    const written = evm
      .writeReport(don, {
        receiver: runtime.config.receiver,
        report,
        gasConfig: { gasLimit: '300000' },
      })
      .result();
    if (
      written.txStatus !== EVM_PB.TxStatus.SUCCESS ||
      written.receiverContractExecutionStatus ===
        EVM_PB.ReceiverContractExecutionStatus.REVERTED
    )
      throw new Error('REPORT_PENDING');

    return `CRE_SIMULATION decision=${decision} txHash=${written.txHash ? bytesToHex(written.txHash) : 'not-broadcast'}`;
  } catch {
    // Never propagate HTTP bodies, credentials, schema inputs or private criteria.
    throw new Error(
      'PROBE_PENDING: transport, context, integrity or chain operation failed',
    );
  }
}

export function onLog(runtime: Runtime<Config>, log: EVMLog): string {
  if (
    log.removed ||
    !log.topics[0] ||
    bytesToHex(log.topics[0]) !==
      keccak256(toHex('ProbeRecorded(bytes32,bytes32,uint8)')) ||
    bytesToHex(log.address).toLowerCase() !==
      runtime.config.receiver.toLowerCase()
  )
    throw new Error('UNEXPECTED_LOG');

  return `CRE_SIMULATION_LOG_RECEIVED txHash=${bytesToHex(log.txHash)}`;
}

export function initWorkflow(config: Config) {
  const http = new cre.capabilities.HTTPCapability();
  const evm = new cre.capabilities.EVMClient(BigInt(ARC.selector));

  return [
    cre.handlerInTee(http.trigger({ authorizedKeys: [] }), onProbe, [
      { tee: 'nitro', regions: ['us-west-2'] },
    ]),
    cre.handler(
      evm.logTrigger({
        addresses: [hexToBase64(config.receiver)],
        topics: [
          {
            values: [
              hexToBase64(
                keccak256(toHex('ProbeRecorded(bytes32,bytes32,uint8)')),
              ),
            ],
          },
          { values: [] },
          { values: [] },
          { values: [] },
        ],
        confidence: 'CONFIDENCE_LEVEL_FINALIZED',
      }),
      onLog,
    ),
  ];
}
