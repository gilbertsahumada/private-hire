import { cre, bytesToBase64, type TeeRuntime } from '@chainlink/cre-sdk';
import { sendRequest, getRequest, rpcResult, completedTask } from './index.js';
import type { PortfolioInput } from '@private-hire/domain';
export interface EndpointConfig { origin: string; allowLocalHttp: boolean; }
export function endpoint(config: EndpointConfig, path: string): string {
  // Avoid URL globals in CRE/WASM. Origin is fixed configuration, never agent data.
  const secure = /^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(config.origin);
  const local = config.allowLocalHttp && /^http:\/\/(localhost|127\.0\.0\.1):[0-9]+$/.test(config.origin);
  if ((!secure && !local) || !path.startsWith('/') || path.includes('..')) throw new Error('ENDPOINT_NOT_ALLOWED');
  return config.origin + path;
}
export function requestJson(runtime: TeeRuntime<unknown>, config: EndpointConfig, path: string, token: string, payload?: unknown): unknown {
  const body = payload === undefined ? undefined : new TextEncoder().encode(JSON.stringify(payload));
  if (body && body.length > 10_000) throw new Error('REQUEST_TOO_LARGE');
  let response;
  try {
    response = new cre.capabilities.HTTPClient().sendRequest(runtime, {
      url: endpoint(config, path), method: payload === undefined ? 'GET' : 'POST',
      ...(body ? { body: bytesToBase64(body) } : {}), timeout: '20s', cacheSettings: { store: false, maxAge: '0s' },
      multiHeaders: { Authorization: { values: [`Bearer ${token}`] }, 'Content-Type': { values: ['application/json'] }, Accept: { values: ['application/json'] }, 'A2A-Version': { values: ['1.0'] } },
    }).result();
  } catch { throw new Error('HTTP_TRANSPORT_PENDING'); }
  if (response.statusCode !== 200 || response.body.length > 100_000) throw new Error('HTTP_RESPONSE_PENDING');
  const header = (name: string) => Object.entries(response.multiHeaders).find(([k]) => k.toLowerCase() === name)?.[1].values[0] ?? Object.entries(response.headers).find(([k]) => k.toLowerCase() === name)?.[1];
  if (!header('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('HTTP_MEDIA_TYPE_PENDING');
  if (path === '/api/agent/a2a' && header('a2a-version') !== '1.0') throw new Error('A2A_VERSION_PENDING');
  try { return JSON.parse(new TextDecoder().decode(response.body)); } catch { throw new Error('HTTP_JSON_PENDING'); }
}
export function sendAgentMessage(runtime: TeeRuntime<unknown>, config: EndpointConfig, token: string, probeId: string, input: PortfolioInput): string {
  const req = sendRequest(probeId, input);
  const result = rpcResult(requestJson(runtime, config, '/api/agent/a2a', token, req), req.id);
  if (!result || typeof result !== 'object' || !('task' in result)) throw new Error('A2A_TASK_PENDING');
  completedTask(result.task, probeId);
  return probeId;
}
export function getAgentTask(runtime: TeeRuntime<unknown>, config: EndpointConfig, token: string, taskId: string) {
  const req = getRequest(taskId);
  return completedTask(rpcResult(requestJson(runtime, config, '/api/agent/a2a', token, req), req.id), taskId);
}
