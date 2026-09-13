import { afterEach, expect, it, vi } from 'vitest';
import {
  SendMessageRequest,
  Task as OfficialTask,
} from '../apps/web/node_modules/@a2a-js/sdk/dist/index.js';
import { cre, type TeeRuntime } from '@chainlink/cre-sdk';
import {
  sendMessage,
  getTask,
  taskPhase,
  type Message,
} from '../packages/agent-transport/src/a2a';
import {
  listTools,
  callTool,
  MCP_VERSION,
} from '../packages/agent-transport/src/mcp';
import {
  createCreTransport,
  validateEndpoint,
} from '../packages/agent-transport/src/cre';
import {
  type RpcTransport,
  type RpcRequest,
} from '../packages/agent-transport/src/rpc';

afterEach(() => vi.restoreAllMocks());

const message: Message = {
  messageId: 'client-message',
  role: 'ROLE_USER',
  parts: [{ text: 'hello' }],
};

const task = {
  id: 'server-task',
  contextId: 'separate-context',
  status: { state: 'TASK_STATE_WORKING' as const },
};

const tool = { name: 'sum', inputSchema: { type: 'object' } };

const complete = {
  resultType: 'complete',
  content: [{ type: 'text', text: '42' }],
  structuredContent: { sum: 42 },
};

const reply =
  (result: unknown): RpcTransport =>
  (req) => ({ jsonrpc: '2.0', id: req.id, result });

it('A2A messages match the pinned official SDK without portfolio types', () => {
  const transport: RpcTransport = (req) => {
    expect(req.method).toBe('SendMessage');
    expect(
      SendMessageRequest.toJSON(SendMessageRequest.fromJSON(req.params)),
    ).toEqual(req.params);
    expect(OfficialTask.toJSON(OfficialTask.fromJSON(task))).toEqual(task);

    return reply({ task })(req, 'a2a');
  };

  expect(sendMessage(transport, 'request', message)).toEqual({ task });
});

it('A2A follows server IDs and preserves pending and terminal states', () => {
  expect(taskPhase(getTask(reply(task), 'query', task.id))).toBe('pending');
  for (const [state, phase] of [
    ['TASK_STATE_COMPLETED', 'completed'],
    ['TASK_STATE_FAILED', 'failed'],
    ['TASK_STATE_CANCELED', 'failed'],
    ['TASK_STATE_REJECTED', 'failed'],
    ['TASK_STATE_INPUT_REQUIRED', 'input-required'],
    ['TASK_STATE_AUTH_REQUIRED', 'input-required'],
  ] as const) {
    expect(
      taskPhase(
        getTask(reply({ ...task, status: { state } }), 'query', task.id),
      ),
    ).toBe(phase);
  }
  expect(() => getTask(reply(task), 'query', 'wrong')).toThrow(
    'A2A_TASK_ID_MISMATCH',
  );
});

it('A2A supports immediate messages and rejects ambiguous responses', () => {
  expect(
    sendMessage(
      reply({ message: { ...message, role: 'ROLE_AGENT' } }),
      'id',
      message,
    ),
  ).toHaveProperty('message');
  expect(() => sendMessage(reply({ task, message }), 'id', message)).toThrow(
    'PROTOCOL_INVALID',
  );
});

// Wire expectations follow the official 2026-07-28 tools and transport examples,
// independently of examples/protocol-provider/server.py.
it('MCP uses 2026 per-request metadata, pagination and no initialize handshake', () => {
  const transport = vi.fn((req: RpcRequest) => {
    expect(req).toEqual({
      jsonrpc: '2.0',
      id: 'list',
      method: 'tools/list',
      params: {
        cursor: 'page-2',
        _meta: {
          'io.modelcontextprotocol/protocolVersion': '2026-07-28',
          'io.modelcontextprotocol/clientInfo': {
            name: 'private-hire-cre',
            version: '0.1.0',
          },
          'io.modelcontextprotocol/clientCapabilities': {},
        },
      },
    });

    return {
      jsonrpc: '2.0',
      id: 'list',
      result: { resultType: 'complete', tools: [tool], nextCursor: 'page-3' },
    };
  });
  expect(listTools(transport, 'list', 'page-2').nextCursor).toBe('page-3');
  expect(transport).toHaveBeenCalledTimes(1);
});

it('MCP preserves text, structured data, and operation errors', () => {
  expect(callTool(reply(complete), 'call', tool, { a: 19, b: 23 })).toEqual(
    complete,
  );
  expect(
    callTool(reply({ ...complete, isError: true }), 'call', tool, {}),
  ).toHaveProperty('isError', true);
});

it('MCP refuses interaction and required tool headers before invocation', () => {
  expect(() =>
    callTool(
      reply({ resultType: 'input_required', inputRequests: {} }),
      'id',
      tool,
      {},
    ),
  ).toThrow('MCP_INTERACTION_UNSUPPORTED');
  const headerTool = {
    name: 'sum',
    inputSchema: {
      properties: { region: { type: 'string', 'x-mcp-header': 'Region' } },
    },
  };
  const transport = vi.fn(reply(complete));
  expect(() => callTool(transport, 'id', headerTool, {})).toThrow(
    'MCP_HEADERS_UNSUPPORTED',
  );
  expect(transport).not.toHaveBeenCalled();
  expect(() =>
    listTools(reply({ resultType: 'complete', tools: [headerTool] }), 'id'),
  ).toThrow('MCP_HEADERS_UNSUPPORTED');
});

it.each(['a2a', 'mcp'] as const)(
  '%s rejects wrong IDs, malformed envelopes and RPC errors without private text',
  (protocol) => {
    const invoke = (transport: RpcTransport) =>
      protocol === 'mcp'
        ? callTool(transport, 'id', tool, {})
        : sendMessage(transport, 'id', message);

    expect(() =>
      invoke(() => ({ jsonrpc: '2.0', id: 'other', result: complete })),
    ).toThrow('PROTOCOL_INVALID');
    expect(() =>
      invoke(() => ({
        jsonrpc: '2.0',
        id: 'id',
        error: { code: -32602, message: 'private-canary' },
      })),
    ).toThrow(/^RPC_ERROR$/);
    expect(() =>
      invoke(() => ({
        jsonrpc: '2.0',
        id: 'id',
        result: complete,
        error: { code: 1, message: 'bad' },
      })),
    ).toThrow('PROTOCOL_INVALID');
  },
);

const runtime = {
  getSecret: () => ({ result: () => ({ value: 'private-canary' }) }),
} as unknown as TeeRuntime<unknown>;

function mockHttp(
  options: {
    status?: number;
    body?: string;
    type?: string;
    version?: string;
  } = {},
) {
  return vi
    .spyOn(cre.capabilities.HTTPClient.prototype, 'sendRequest')
    .mockImplementation(
      () =>
        ({
          result: () => ({
            statusCode: options.status ?? 200,
            body: new TextEncoder().encode(
              options.body ??
                JSON.stringify({ jsonrpc: '2.0', id: 'id', result: complete }),
            ),
            headers: {
              'content-type': options.type ?? 'application/json',
              'a2a-version': options.version ?? '1.0',
            },
            multiHeaders: {},
          }),
        }) as never,
    );
}

function transport() {
  return createCreTransport(runtime, {
    endpoint: 'https://example.com/remote',
    secretName: 'TOKEN',
  });
}

const request: RpcRequest = {
  jsonrpc: '2.0',
  id: 'id',
  method: 'tools/call',
  params: { name: 'sum' },
};

it('CRE sends base64, scoped auth and protocol-specific headers, no retries', () => {
  const spy = mockHttp();
  transport()(request, 'mcp');
  const sent = spy.mock.calls[0][1];
  expect(sent).toMatchObject({
    url: 'https://example.com/remote',
    timeout: '10s',
    body: Buffer.from(JSON.stringify(request)).toString('base64'),
    multiHeaders: {
      'MCP-Protocol-Version': { values: [MCP_VERSION] },
      'Mcp-Name': { values: ['sum'] },
      'Mcp-Method': { values: ['tools/call'] },
      Authorization: { values: ['Bearer private-canary'] },
    },
  });
  expect(sent.multiHeaders).not.toHaveProperty('A2A-Version');
  transport()({ ...request, method: 'SendMessage' }, 'a2a');
  expect(spy.mock.calls[1][1].multiHeaders).not.toHaveProperty(
    'MCP-Protocol-Version',
  );
  expect(spy).toHaveBeenCalledTimes(2);
});

it.each(['a2a', 'mcp'] as const)(
  '%s handles invalid JSON, auth, timeout, media and size limits safely',
  (protocol) => {
    const invoke = () => transport()(request, protocol);

    mockHttp({ status: 401 });
    expect(invoke).toThrow('HTTP_UNAUTHORIZED');
    vi.restoreAllMocks();
    mockHttp({ body: 'invalid private-canary' });
    expect(invoke).toThrow(/^HTTP_JSON_INVALID$/);
    vi.restoreAllMocks();
    mockHttp({ type: 'text/event-stream' });
    expect(invoke).toThrow('SSE_UNSUPPORTED');
    vi.restoreAllMocks();
    mockHttp({ type: 'text/html' });
    expect(invoke).toThrow('HTTP_MEDIA_TYPE_INVALID');
    vi.restoreAllMocks();
    mockHttp({ status: 302 });
    expect(invoke).toThrow('HTTP_REDIRECT_UNSUPPORTED');
    vi.restoreAllMocks();
    mockHttp({ body: 'a'.repeat(100001) });
    expect(invoke).toThrow('RESPONSE_TOO_LARGE');
    vi.restoreAllMocks();
    const spy = vi
      .spyOn(cre.capabilities.HTTPClient.prototype, 'sendRequest')
      .mockImplementation(() => {
        throw new Error('timeout private-canary');
      });
    expect(invoke).toThrow(/^HTTP_TRANSPORT_FAILED$/);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(() =>
      transport()(
        { ...request, params: { data: 'a'.repeat(10000) } },
        protocol,
      ),
    ).toThrow('REQUEST_TOO_LARGE');
    expect(spy).toHaveBeenCalledTimes(1);
  },
);

it('refuses insecure endpoints and allows explicitly selected local simulation', () => {
  for (const endpoint of [
    'http://example.com/x',
    'https://user:pass@example.com',
    'https://example.com/../x',
    'https://example.com/x?token=secret',
    'https://example.com\\evil',
  ])
    expect(() => validateEndpoint({ endpoint })).toThrow(
      'ENDPOINT_NOT_ALLOWED',
    );
  expect(() =>
    validateEndpoint({ endpoint: 'http://127.0.0.1:9000/mcp' }),
  ).toThrow();
  expect(
    validateEndpoint({
      endpoint: 'http://127.0.0.1:9000/mcp',
      allowLocalHttp: true,
    }),
  ).toContain('9000');
});

it('secret failures stay redacted and optional auth performs no secret lookup', () => {
  mockHttp();
  const getSecret = vi.fn(() => {
    throw new Error('private-canary');
  });
  const rt = { getSecret } as unknown as TeeRuntime<unknown>;
  createCreTransport(rt, { endpoint: 'https://example.com' })(request, 'mcp');
  expect(getSecret).not.toHaveBeenCalled();
  expect(() =>
    createCreTransport(rt, {
      endpoint: 'https://example.com',
      secretName: 'x',
    })(request, 'mcp'),
  ).toThrow(/^AUTH_SECRET_UNAVAILABLE$/);
});

it('reports MCP version and capability errors without falling back or retrying', () => {
  for (const [code, expected] of [
    [-32022, 'PROTOCOL_VERSION_UNSUPPORTED'],
    [-32021, 'MCP_INTERACTION_UNSUPPORTED'],
  ] as const) {
    const spy = mockHttp({
      status: 400,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'id',
        error: { code, message: 'private-canary' },
      }),
    });
    expect(() => callTool(transport(), 'id', tool, {})).toThrow(expected);
    expect(spy).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  }
  mockHttp({ version: '0.3' });
  expect(() => getTask(transport(), 'id', 'server-task')).toThrow(
    'PROTOCOL_VERSION_UNSUPPORTED',
  );
});

it('handles MCP method-not-found HTTP errors as correlated RPC errors', () => {
  mockHttp({
    status: 404,
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'id',
      error: { code: -32601, message: 'Unknown tool' },
    }),
  });
  expect(() => callTool(transport(), 'id', tool, {})).toThrow('RPC_ERROR');
});

it('rejects malformed protocol results instead of treating them as success', () => {
  expect(() => listTools(reply({ tools: [] }), 'id')).toThrow(
    'PROTOCOL_INVALID',
  );
  expect(() =>
    callTool(reply({ resultType: 'complete', content: 'bad' }), 'id', tool, {}),
  ).toThrow('PROTOCOL_INVALID');
  expect(() =>
    getTask(reply({ ...task, status: { state: 'INVENTED' } }), 'id', task.id),
  ).toThrow('PROTOCOL_INVALID');
});
