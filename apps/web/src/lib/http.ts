import { getCloudflareContext } from '@opennextjs/cloudflare';
import type { Bindings } from './storage';
export function bindings(): Bindings { return getCloudflareContext().env as unknown as Bindings; }
export function json(data: unknown, status = 200) { return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'A2A-Version': '1.0', 'X-Content-Type-Options': 'nosniff' } }); }
export async function authorized(request: Request, secret: string): Promise<boolean> {
  if (!secret || secret.length < 32) return false;
  const actual = request.headers.get('authorization') ?? '';
  const [a, b] = await Promise.all([actual, `Bearer ${secret}`].map(s => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))));
  const x = new Uint8Array(a), y = new Uint8Array(b); let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x[i] ^ y[i];
  return difference === 0;
}
export async function limitedJson(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('UNSUPPORTED_MEDIA_TYPE');
  if (!request.body) throw new Error('INVALID_JSON');
  const reader = request.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 10_000) { await reader.cancel(); throw new Error('REQUEST_TOO_LARGE'); } chunks.push(value); } } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0; for (const c of chunks) { bytes.set(c, offset); offset += c.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new Error('INVALID_JSON'); }
}
export function errorCode(e: unknown): string {
  const allowed = ['CONFLICT', 'PROBE_NOT_FOUND', 'TASK_NOT_FOUND', 'TASK_PENDING', 'PROBE_EXPIRED', 'PROBE_DISABLED', 'REQUEST_TOO_LARGE', 'INVALID_JSON', 'UNSUPPORTED_MEDIA_TYPE'];
  return e instanceof Error && allowed.includes(e.message) ? e.message : 'OPERATION_PENDING';
}
