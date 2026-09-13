import { cre, bytesToBase64, type TeeRuntime } from '@chainlink/cre-sdk';
import { AdapterError, type RpcTransport } from './rpc.js';
import { MCP_VERSION } from './mcp.js';

export { AdapterError } from './rpc.js';

export type { RpcTransport, RpcRequest, Protocol } from './rpc.js';

export interface TransportConfig {
  endpoint: string;
  allowLocalHttp?: boolean;
  secretName?: string;
}

export function validateEndpoint(config: TransportConfig): string {
  const { endpoint } = config;
  const https =
    /^https:\/\/[a-z0-9.-]+(?::[0-9]+)?(?:\/[A-Za-z0-9_./~-]*)?$/i.test(
      endpoint,
    );
  const local =
    config.allowLocalHttp &&
    /^http:\/\/(?:localhost|127\.0\.0\.1):[0-9]+(?:\/[A-Za-z0-9_./~-]*)?$/.test(
      endpoint,
    );
  if ((!https && !local) || endpoint.includes('..'))
    throw new AdapterError('ENDPOINT_NOT_ALLOWED');

  return endpoint;
}

export function createCreTransport(
  runtime: TeeRuntime<unknown>,
  config: TransportConfig,
): RpcTransport {
  const url = validateEndpoint(config);

  return (request, protocol) => {
    let encoded: Uint8Array;
    try {
      encoded = new TextEncoder().encode(JSON.stringify(request));
    } catch {
      throw new AdapterError('REQUEST_INVALID');
    }
    if (encoded.length > 10_000) throw new AdapterError('REQUEST_TOO_LARGE');
    const headers: Record<string, { values: string[] }> = {
      'Content-Type': { values: ['application/json'] },
      Accept: { values: ['application/json'] },
    };
    if (protocol === 'a2a') headers['A2A-Version'] = { values: ['1.0'] };
    else {
      headers['MCP-Protocol-Version'] = { values: [MCP_VERSION] };
      headers['Mcp-Method'] = { values: [request.method] };
      if (request.method === 'tools/call') {
        if (
          typeof request.params.name !== 'string' ||
          !/^[A-Za-z0-9_.-]{1,128}$/.test(request.params.name)
        )
          throw new AdapterError('REQUEST_INVALID');
        headers['Mcp-Name'] = { values: [request.params.name] };
      }
    }
    if (config.secretName) {
      let token: string;
      try {
        token = runtime.getSecret({ id: config.secretName }).result().value;
      } catch {
        throw new AdapterError('AUTH_SECRET_UNAVAILABLE');
      }
      if (!token || /[\r\n]/.test(token))
        throw new AdapterError('AUTH_SECRET_INVALID');
      headers.Authorization = { values: [`Bearer ${token}`] };
    }
    let response;
    try {
      response = new cre.capabilities.HTTPClient()
        .sendRequest(runtime, {
          url,
          method: 'POST',
          body: bytesToBase64(encoded),
          timeout: '10s',
          cacheSettings: { store: false, maxAge: '0s' },
          multiHeaders: headers,
        })
        .result();
    } catch {
      throw new AdapterError('HTTP_TRANSPORT_FAILED');
    }
    if (response.body.length > 100_000)
      throw new AdapterError('RESPONSE_TOO_LARGE');

    const header = (key: string) =>
      Object.entries(response.multiHeaders ?? {}).find(
        ([k]) => k.toLowerCase() === key,
      )?.[1].values[0] ??
      Object.entries(response.headers ?? {}).find(
        ([k]) => k.toLowerCase() === key,
      )?.[1];

    if (response.statusCode === 401 || response.statusCode === 403)
      throw new AdapterError('HTTP_UNAUTHORIZED');
    if (response.statusCode >= 300 && response.statusCode < 400)
      throw new AdapterError('HTTP_REDIRECT_UNSUPPORTED');
    if (
      protocol === 'mcp' &&
      header('mcp-protocol-version') &&
      header('mcp-protocol-version') !== MCP_VERSION
    )
      throw new AdapterError('PROTOCOL_VERSION_UNSUPPORTED');
    if (protocol === 'a2a' && header('a2a-version') !== '1.0')
      throw new AdapterError('PROTOCOL_VERSION_UNSUPPORTED');
    if (
      header('content-type')?.split(';')[0].trim().toLowerCase() ===
      'text/event-stream'
    )
      throw new AdapterError('SSE_UNSUPPORTED');
    if (
      header('content-type')?.split(';')[0].trim().toLowerCase() !==
      'application/json'
    )
      throw new AdapterError('HTTP_MEDIA_TYPE_INVALID');
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder().decode(response.body));
    } catch {
      throw new AdapterError('HTTP_JSON_INVALID');
    }
    if (response.statusCode !== 200) {
      if (
        protocol === 'mcp' &&
        [400, 404].includes(response.statusCode) &&
        value &&
        typeof value === 'object' &&
        'error' in value
      ) {
        // The protocol client validates any RPC error envelope before reporting it.
        return value;
      }
      throw new AdapterError('HTTP_STATUS_FAILED');
    }

    return value;
  };
}
