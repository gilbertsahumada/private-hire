import { z } from 'zod';
import { AdapterError, parse, rpc, type RpcTransport } from './rpc.js';

export { AdapterError } from './rpc.js';

export type { RpcTransport, RpcRequest, Protocol } from './rpc.js';

export const A2A_VERSION = '1.0';

const partSchema = z
  .object({
    text: z.string().optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    raw: z.string().optional(),
    url: z.string().optional(),
  })
  .passthrough()
  .refine(
    (p) =>
      [p.text, p.data, p.raw, p.url].filter((v) => v !== undefined).length ===
      1,
  );

export const messageSchema = z
  .object({
    messageId: z.string().min(1),
    role: z.enum(['ROLE_USER', 'ROLE_AGENT']),
    parts: z.array(partSchema).min(1),
    taskId: z.string().optional(),
    contextId: z.string().optional(),
  })
  .passthrough();

export const taskSchema = z
  .object({
    id: z.string().min(1),
    contextId: z.string().min(1),
    status: z
      .object({
        state: z.enum([
          'TASK_STATE_SUBMITTED',
          'TASK_STATE_WORKING',
          'TASK_STATE_COMPLETED',
          'TASK_STATE_FAILED',
          'TASK_STATE_CANCELED',
          'TASK_STATE_REJECTED',
          'TASK_STATE_INPUT_REQUIRED',
          'TASK_STATE_AUTH_REQUIRED',
        ]),
      })
      .passthrough(),
    artifacts: z
      .array(
        z
          .object({ artifactId: z.string(), parts: z.array(partSchema) })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export type Message = z.infer<typeof messageSchema>;

export type Task = z.infer<typeof taskSchema>;

export type SendResult = { task: Task } | { message: Message };

export function sendMessage(
  transport: RpcTransport,
  id: string,
  message: Message,
): SendResult {
  const result = rpc(transport, 'a2a', {
    jsonrpc: '2.0',
    id,
    method: 'SendMessage',
    params: {
      message: parse(messageSchema, message),
      configuration: { returnImmediately: true },
    },
  });
  const parsed = parse(
    z
      .object({
        task: taskSchema.optional(),
        message: messageSchema.optional(),
      })
      .refine((r) => Boolean(r.task) !== Boolean(r.message)),
    result,
  );

  return parsed.task ? { task: parsed.task } : { message: parsed.message! };
}

export function getTask(
  transport: RpcTransport,
  id: string,
  taskId: string,
): Task {
  if (!taskId) throw new AdapterError('REQUEST_INVALID');
  const result = parse(
    taskSchema,
    rpc(transport, 'a2a', {
      jsonrpc: '2.0',
      id,
      method: 'GetTask',
      params: { id: taskId },
    }),
  );
  if (result.id !== taskId) throw new AdapterError('A2A_TASK_ID_MISMATCH');

  return result;
}

export function taskPhase(
  task: Task,
): 'pending' | 'completed' | 'failed' | 'input-required' {
  switch (task.status.state) {
    case 'TASK_STATE_COMPLETED':
      return 'completed';
    case 'TASK_STATE_FAILED':
    case 'TASK_STATE_CANCELED':
    case 'TASK_STATE_REJECTED':
      return 'failed';
    case 'TASK_STATE_INPUT_REQUIRED':
    case 'TASK_STATE_AUTH_REQUIRED':
      return 'input-required';
    default:
      return 'pending';
  }
}
