import {
  cre,
  bytesToHex,
  hexToBase64,
  type TeeRuntime,
  type HTTPPayload,
} from '@chainlink/cre-sdk';
import { EVM_PB } from '@chainlink/cre-sdk/pb';
import { z } from 'zod';
import {
  decodeFunctionResult,
  encodeFunctionData,
  parseEventLogs,
  type Address,
  type Hex,
} from 'viem';
import { ARC, MARKET, escrowAbi, encodeEvaluation } from '@private-hire/chain';
import {
  manifestSchema,
  deliverySchema,
  jobCommitment,
  evaluate,
  probeIdSchema,
} from '@private-hire/domain';
import {
  jobSendRequest,
  rpcResult,
  completedTask,
} from '@private-hire/agent-transport';
import { requestJson, getAgentTask } from '@private-hire/agent-transport/tee';

export const configSchema = z.strictObject({
  origin: z.string(),
  allowLocalHttp: z.boolean(),
  receiver: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  writeReport: z.boolean(),
});

type Config = z.infer<typeof configSchema>;

const equal = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export function onJob(runtime: TeeRuntime<Config>, payload: HTTPPayload) {
  let stage = 'trigger';
  try {
    const trigger = z
      .strictObject({
        requestId: probeIdSchema,
        phase: z.enum(['dispatch', 'evaluate']),
        submitTx: z
          .string()
          .regex(/^0x[0-9a-fA-F]{64}$/)
          .optional(),
      })
      .parse(JSON.parse(new TextDecoder().decode(payload.input)));
    stage = 'secrets';
    const token = runtime.getSecret({ id: 'JOB_CONTEXT_TOKEN' }).result().value;
    const agentToken = runtime.getSecret({ id: 'A2A_TOKEN' }).result().value;
    stage = 'context_transport';
    const rawContext = requestJson(
      runtime,
      runtime.config,
      `/api/internal/jobs/${trigger.requestId}/context`,
      token,
    );
    stage = 'context_schema';
    const context = z
      .object({
        manifest: manifestSchema,
        manifestHash: z.string(),
        jobId: z.string().regex(/^[1-9][0-9]*$/),
      })
      .parse(rawContext);
    stage = 'context_validation';
    const m = context.manifest;
    if (
      m.requestId !== trigger.requestId ||
      m.input.requestId !== trigger.requestId ||
      jobCommitment('manifest', m) !== context.manifestHash ||
      !equal(m.escrow, MARKET.escrow) ||
      !equal(m.provider, MARKET.provider) ||
      !equal(m.evaluator, runtime.config.receiver) ||
      m.endpoint !== `${MARKET.origin}/api/agent/a2a` ||
      m.expiredAt <= Math.floor(runtime.now().getTime() / 1000)
    )
      throw new Error('CONTEXT_PENDING');
    stage = 'chain_read';
    const don = runtime.usingTheDons();
    const evm = new cre.capabilities.EVMClient(BigInt(ARC.selector));
    const read = evm
      .callContract(don, {
        call: {
          to: hexToBase64(MARKET.escrow),
          data: hexToBase64(
            encodeFunctionData({
              abi: escrowAbi,
              functionName: 'getJob',
              args: [BigInt(context.jobId)],
            }),
          ),
        },
      })
      .result();
    const job = decodeFunctionResult({
      abi: escrowAbi,
      functionName: 'getJob',
      data: bytesToHex(read.data),
    });
    stage = 'chain_validation';
    if (
      job.id !== BigInt(context.jobId) ||
      !equal(job.client, m.buyer) ||
      !equal(job.provider, m.provider) ||
      !equal(job.evaluator, m.evaluator) ||
      job.description !== context.manifestHash ||
      job.budget !== BigInt(m.budget) ||
      job.expiredAt !== BigInt(m.expiredAt)
    )
      throw new Error('CHAIN_PENDING');
    if (trigger.phase === 'dispatch') {
      if (job.status !== 1) throw new Error('NOT_FUNDED');
      const request = jobSendRequest(
        trigger.requestId,
        context.manifestHash,
        m.input,
      );
      const result = rpcResult(
        requestJson(
          runtime,
          runtime.config,
          '/api/agent/a2a',
          agentToken,
          request,
        ),
        request.id,
      );
      if (!result || typeof result !== 'object' || !('task' in result))
        throw new Error('TASK_PENDING');
      completedTask(result.task, trigger.requestId);

      return `JOB_DISPATCHED jobId=${job.id}`;
    }
    stage = 'submission_state';
    if (job.status !== 2 || !trigger.submitTx) throw new Error('NOT_SUBMITTED');
    stage = 'receipt_read';
    const receipt = evm
      .getTransactionReceipt(don, {
        hash: hexToBase64(trigger.submitTx as Hex),
      })
      .result().receipt;
    stage = 'receipt_validation';
    if (
      !receipt ||
      receipt.status !== 1n ||
      !equal(bytesToHex(receipt.txHash), trigger.submitTx)
    )
      throw new Error('RECEIPT_PENDING');
    stage = 'receipt_logs';
    const logs = parseEventLogs({
      abi: escrowAbi,
      eventName: 'JobSubmitted',
      logs: receipt.logs
        .filter((l) => equal(bytesToHex(l.address), MARKET.escrow))
        .map((l) => ({
          address: bytesToHex(l.address),
          data: bytesToHex(l.data),
          topics: l.topics.map(bytesToHex) as [Hex, ...Hex[]],
          blockHash: bytesToHex(l.blockHash),
          blockNumber: null,
          logIndex: null,
          transactionHash: bytesToHex(l.txHash),
          transactionIndex: null,
          removed: false,
        })),
    });
    const submitted = logs.find(
      (l) => l.args.jobId === job.id && equal(l.args.provider, m.provider),
    );
    if (!submitted) throw new Error('COMMITMENT_PENDING');
    stage = 'artifact_transport';
    const artifact = getAgentTask(
      runtime,
      runtime.config,
      agentToken,
      trigger.requestId,
    );
    stage = 'artifact_validation';
    const envelope = deliverySchema.parse(artifact.envelope);
    const hash = jobCommitment('result', envelope);
    if (
      envelope.jobId !== context.jobId ||
      envelope.requestId !== trigger.requestId ||
      !equal(envelope.escrow, m.escrow) ||
      hash !== artifact.resultHash ||
      hash !== submitted.args.deliverable
    )
      throw new Error('INTEGRITY_PENDING');
    stage = 'evaluation';
    const decision = evaluate(m.input, m.policy, envelope.result);
    if (!runtime.config.writeReport)
      return `JOB_EVALUATED jobId=${job.id} decision=${decision} broadcast=false`;
    stage = 'report';
    const report = don
      .report({
        encodedPayload: hexToBase64(
          encodeEvaluation({
            receiver: m.evaluator as Address,
            jobId: job.id,
            manifestHash: context.manifestHash as Hex,
            deliverableHash: hash,
            decision,
            validUntil: job.expiredAt,
          }),
        ),
        encoderName: 'evm',
        signingAlgo: 'ecdsa',
        hashingAlgo: 'keccak256',
      })
      .result();
    stage = 'write_report';
    const written = evm
      .writeReport(don, {
        receiver: m.evaluator,
        report,
        gasConfig: { gasLimit: '400000' },
      })
      .result();
    if (
      written.txStatus !== EVM_PB.TxStatus.SUCCESS ||
      written.receiverContractExecutionStatus ===
        EVM_PB.ReceiverContractExecutionStatus.REVERTED
    )
      throw new Error('REPORT_PENDING');

    return `JOB_EVALUATED jobId=${job.id} decision=${decision} txHash=${written.txHash ? bytesToHex(written.txHash) : 'not-broadcast'}`;
  } catch (error) {
    // Only locally defined error codes may leave the private handler.
    const code =
      error instanceof Error &&
      [
        'HTTP_TRANSPORT_PENDING',
        'HTTP_RESPONSE_PENDING',
        'HTTP_MEDIA_TYPE_PENDING',
        'HTTP_JSON_PENDING',
        'A2A_VERSION_PENDING',
      ].includes(error.message)
        ? error.message
        : 'VALIDATION_FAILED';
    throw new Error(`JOB_PENDING: ${stage} ${code}`);
  }
}

export function initWorkflow() {
  return [
    cre.handlerInTee(
      new cre.capabilities.HTTPCapability().trigger({ authorizedKeys: [] }),
      onJob,
      [{ tee: 'nitro', regions: ['us-west-2'] }],
    ),
  ];
}
