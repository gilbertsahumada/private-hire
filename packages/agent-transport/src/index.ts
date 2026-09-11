import { inputSchema, probeIdSchema, type PortfolioInput } from '@private-hire/domain';
import { z } from 'zod';
export const A2A_VERSION = '1.0';
export const rpcSchema = z.strictObject({ jsonrpc: z.literal('2.0'), id: z.union([z.string().min(1).max(128), z.number().int().safe()]), method: z.string(), params: z.unknown() });
export const sendSchema = z.strictObject({
  message: z.strictObject({ messageId: z.string().min(1).max(128), role: z.literal('ROLE_USER'), parts: z.array(z.strictObject({ data: z.strictObject({ probeId: probeIdSchema, input: inputSchema }), mediaType: z.literal('application/json').optional() })).length(1) }),
  configuration: z.strictObject({ returnImmediately: z.literal(false).optional(), acceptedOutputModes: z.array(z.literal('application/json')).optional() }).optional(),
});
export const getSchema = z.strictObject({ id: probeIdSchema });
export function sendRequest(probeId: string, input: PortfolioInput) {
  return { jsonrpc: '2.0' as const, id: `${probeId}-send`, method: 'SendMessage', params: { message: { messageId: `${probeId}-message`, role: 'ROLE_USER', parts: [{ data: { probeId, input }, mediaType: 'application/json' }] }, configuration: { acceptedOutputModes: ['application/json'] } } };
}
export function getRequest(taskId: string) { return { jsonrpc: '2.0' as const, id: `${taskId}-get`, method: 'GetTask', params: { id: taskId } }; }
export function rpcResult(raw: unknown, id: string): unknown {
  const response = z.object({ jsonrpc: z.literal('2.0'), id: z.union([z.string(), z.number()]), result: z.unknown().optional(), error: z.unknown().optional() }).parse(raw);
  if (response.id !== id || response.error !== undefined || response.result === undefined) throw new Error('A2A_RPC_PENDING');
  return response.result;
}
const taskSchema = z.object({ id: probeIdSchema, contextId: probeIdSchema, status: z.object({ state: z.literal('TASK_STATE_COMPLETED') }), artifacts: z.array(z.object({ artifactId: z.string(), parts: z.array(z.object({ data: z.object({ envelope: z.unknown(), resultHash: z.string().regex(/^0x[0-9a-f]{64}$/) }) })).length(1) })).length(1) });
export function completedTask(raw: unknown, taskId: string) {
  const task = taskSchema.parse(raw);
  if (task.id !== taskId || task.contextId !== taskId) throw new Error('A2A_TASK_PENDING');
  return task.artifacts[0].parts[0].data;
}
