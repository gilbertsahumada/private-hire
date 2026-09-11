import { canonical } from '@private-hire/domain';
export interface Statement { bind(...args: unknown[]): Statement; first<T>(): Promise<T | null>; run(): Promise<unknown>; }
export interface Database { prepare(sql: string): Statement; }
export interface ObjectBody { text(): Promise<string>; }
export interface Bucket { get(key: string): Promise<ObjectBody | null>; put(key: string, value: string, options: { onlyIf: { etagDoesNotMatch: string } }): Promise<unknown | null>; }
export interface Bindings { DB: Database; PRIVATE_DATA: Bucket; STORAGE_KEY: string; A2A_TOKEN: string; CONTEXT_TOKEN: string; SETUP_TOKEN: string; PUBLIC_ORIGIN: string; ENABLE_PROBE: string; }
function decodeKey(secret: string) {
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('STORAGE_KEY_NOT_CONFIGURED');
  return Uint8Array.from(secret.match(/../g)!, b => parseInt(b, 16));
}
const hex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => { if (!/^(?:[0-9a-f]{2})+$/.test(s)) throw new Error('INTEGRITY_PENDING'); return Uint8Array.from(s.match(/../g)!, b => parseInt(b, 16)); };
export const nonce = () => hex(crypto.getRandomValues(new Uint8Array(32)));
export async function encrypt(secret: string, aad: string, value: unknown): Promise<string> {
  const key = await crypto.subtle.importKey('raw', decodeKey(secret), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(aad) }, key, new TextEncoder().encode(canonical(value)));
  return JSON.stringify({ version: 1, iv: hex(iv), ciphertext: hex(new Uint8Array(ciphertext)) });
}
export async function decrypt(secret: string, aad: string, body: string): Promise<unknown> {
  try {
    const obj: unknown = JSON.parse(body);
    if (!obj || typeof obj !== 'object' || !('version' in obj) || obj.version !== 1 || !('iv' in obj) || typeof obj.iv !== 'string' || obj.iv.length !== 24 || !('ciphertext' in obj) || typeof obj.ciphertext !== 'string') throw new Error();
    const key = await crypto.subtle.importKey('raw', decodeKey(secret), 'AES-GCM', false, ['decrypt']);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unhex(obj.iv), additionalData: new TextEncoder().encode(aad) }, key, unhex(obj.ciphertext));
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch { throw new Error('INTEGRITY_PENDING'); }
}
export async function readObject(env: Bindings, key: string, aad: string) {
  const obj = await env.PRIVATE_DATA.get(key);
  return obj ? decrypt(env.STORAGE_KEY, aad, await obj.text()) : null;
}
export async function writeOnce(env: Bindings, key: string, aad: string, value: unknown) {
  await env.PRIVATE_DATA.put(key, await encrypt(env.STORAGE_KEY, aad, value), { onlyIf: { etagDoesNotMatch: '*' } });
  const saved = await readObject(env, key, aad);
  if (!saved) throw new Error('STORAGE_PENDING');
  return saved;
}
