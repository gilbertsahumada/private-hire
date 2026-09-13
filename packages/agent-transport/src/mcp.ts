import { z } from 'zod';
import { AdapterError, parse, rpc, type RpcTransport } from './rpc.js';

export { AdapterError } from './rpc.js';

export type { RpcTransport, RpcRequest, Protocol } from './rpc.js';

export const MCP_VERSION = '2026-07-28';

const name = z.string().regex(/^[A-Za-z0-9_.-]{1,128}$/);

export const toolSchema = z
  .object({ name, inputSchema: z.record(z.string(), z.unknown()) })
  .passthrough();

export type Tool = z.infer<typeof toolSchema>;

function requiresHeaders(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;

  return Object.entries(value).some(
    ([key, item]) => key === 'x-mcp-header' || requiresHeaders(item),
  );
}

function supported(tool: Tool) {
  if (requiresHeaders(tool.inputSchema))
    throw new AdapterError('MCP_HEADERS_UNSUPPORTED');
}

function request(
  transport: RpcTransport,
  id: string,
  method: string,
  params: Record<string, unknown>,
) {
  const result = rpc(transport, 'mcp', {
    jsonrpc: '2.0',
    id,
    method,
    params: {
      ...params,
      _meta: {
        'io.modelcontextprotocol/protocolVersion': MCP_VERSION,
        'io.modelcontextprotocol/clientInfo': {
          name: 'private-hire-cre',
          version: '0.1.0',
        },
        'io.modelcontextprotocol/clientCapabilities': {},
      },
    },
  });
  if (
    result &&
    typeof result === 'object' &&
    ('inputRequests' in result ||
      ('resultType' in result && result.resultType !== 'complete'))
  )
    throw new AdapterError('MCP_INTERACTION_UNSUPPORTED');

  return result;
}

export function listTools(
  transport: RpcTransport,
  id: string,
  cursor?: string,
) {
  const result = parse(
    z
      .object({
        resultType: z.literal('complete'),
        tools: z.array(toolSchema),
        nextCursor: z.string().optional(),
      })
      .passthrough(),
    request(
      transport,
      id,
      'tools/list',
      cursor === undefined ? {} : { cursor },
    ),
  );
  // Fail closed for this limited profile rather than silently invoking tools whose headers are required.
  result.tools.forEach(supported);

  return result;
}

export function callTool(
  transport: RpcTransport,
  id: string,
  tool: Tool,
  args: Record<string, unknown>,
) {
  const definition = parse(toolSchema, tool);
  supported(definition);

  return parse(
    z
      .object({
        resultType: z.literal('complete'),
        content: z.array(z.object({ type: z.string() }).passthrough()),
        structuredContent: z.record(z.string(), z.unknown()).optional(),
        isError: z.boolean().optional(),
      })
      .passthrough(),
    request(transport, id, 'tools/call', {
      name: definition.name,
      arguments: args,
    }),
  );
}
