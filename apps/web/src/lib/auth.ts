import { createSiweMessage } from 'viem/siwe';
import {
  createPublicClient,
  getAddress,
  http,
  keccak256,
  toHex,
  type Hex,
} from 'viem';
import { arcTestnet } from 'viem/chains';
import { z } from 'zod';
import { nonce } from './storage';
import { MarketError, type MarketEnv } from './market-env';

const client = createPublicClient({ chain: arcTestnet, transport: http() });

const now = () => Math.floor(Date.now() / 1000);

const tokenHash = (value: string) => keccak256(toHex(value));

export async function challenge(env: MarketEnv, wallet: string) {
  const address = getAddress(
    z
      .string()
      .regex(/^0x[0-9a-fA-F]{40}$/)
      .parse(wallet),
  );
  const value = nonce();
  const expires = now() + 300;
  const message = createSiweMessage({
    address,
    chainId: arcTestnet.id,
    domain: new URL(env.PUBLIC_ORIGIN).host,
    uri: env.PUBLIC_ORIGIN,
    version: '1',
    nonce: value,
    issuedAt: new Date(),
    expirationTime: new Date(expires * 1000),
    statement:
      'Sign in to Confidential Agent Jobs. This does not authorize a transaction.',
  });
  await env.DB.prepare(
    'INSERT INTO auth_challenges(nonce,wallet,message,expires_at) VALUES(?,?,?,?)',
  )
    .bind(value, address.toLowerCase(), message, expires)
    .run();

  return { nonce: value, message };
}

export async function verifyLogin(
  env: MarketEnv,
  value: string,
  signature: string,
  verify = client.verifyMessage,
) {
  const row = await env.DB.prepare(
    'SELECT * FROM auth_challenges WHERE nonce=? AND expires_at>?',
  )
    .bind(value, now())
    .first<{ wallet: string; message: string }>();
  if (!row || !/^0x[0-9a-fA-F]+$/.test(signature))
    throw new MarketError('INVALID_LOGIN', 401);
  if (
    !(await verify({
      address: getAddress(row.wallet),
      message: row.message,
      signature: signature as Hex,
    }))
  )
    throw new MarketError('INVALID_LOGIN', 401);
  const consumed = await env.DB.prepare(
    'DELETE FROM auth_challenges WHERE nonce=? AND expires_at>? RETURNING nonce',
  )
    .bind(value, now())
    .first();
  if (!consumed) throw new MarketError('LOGIN_ALREADY_USED', 401);
  const token = nonce();
  await env.DB.prepare(
    'INSERT INTO auth_sessions(token_hash,wallet,expires_at) VALUES(?,?,?)',
  )
    .bind(tokenHash(token), row.wallet, now() + 8 * 3600)
    .run();

  return { token, wallet: row.wallet };
}

export function cookie(token: string, age = 8 * 3600) {
  return `market_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
}

function sessionToken(request: Request) {
  return /(?:^|;\s*)market_session=([a-f0-9]{64})(?:;|$)/.exec(
    request.headers.get('cookie') ?? '',
  )?.[1];
}

export async function session(request: Request, env: MarketEnv) {
  const token = sessionToken(request);
  const row = token
    ? await env.DB.prepare(
        'SELECT wallet FROM auth_sessions WHERE token_hash=? AND expires_at>?',
      )
        .bind(tokenHash(token), now())
        .first<{ wallet: string }>()
    : null;
  if (!row) throw new MarketError('SIGN_IN_REQUIRED', 401);

  return row.wallet;
}

export async function logout(request: Request, env: MarketEnv) {
  const token = sessionToken(request);
  if (token)
    await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash=?')
      .bind(tokenHash(token))
      .run();
}
