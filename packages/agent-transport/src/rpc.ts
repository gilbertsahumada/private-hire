import { z } from 'zod';

export type Protocol = 'a2a' | 'mcp';

export class AdapterError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'AdapterError';
  }
}

export interface RpcRequest {
  jsonrpc: '2.0';
  id: string;
  method: string;
  params: Record<string, unknown>;
}

export type RpcTransport = (request: RpcRequest, protocol: Protocol) => unknown;

export function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AdapterError('PROTOCOL_INVALID');

  return result.data;
}

export function rpc(
  transport: RpcTransport,
  protocol: Protocol,
  request: RpcRequest,
): unknown {
  const response = parse(
    z.object({
      jsonrpc: z.literal('2.0'),
      id: z.string(),
      result: z.unknown().optional(),
      error: z
        .object({ code: z.number().int(), message: z.string() })
        .optional(),
    }),
    transport(request, protocol),
  );
  if (
    response.id !== request.id ||
    (response.result === undefined) === (response.error === undefined)
  )
    throw new AdapterError('PROTOCOL_INVALID');
  if (response.error) {
    if (protocol === 'mcp' && response.error.code === -32022)
      throw new AdapterError('PROTOCOL_VERSION_UNSUPPORTED');
    if (protocol === 'mcp' && response.error.code === -32021)
      throw new AdapterError('MCP_INTERACTION_UNSUPPORTED');
    throw new AdapterError('RPC_ERROR');
  }

  return response.result;
}
