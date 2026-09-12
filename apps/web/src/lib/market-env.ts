import type { Bindings, Statement } from './storage';
import { bindings } from './http';

interface MarketStatement extends Statement {
  bind(...args: unknown[]): MarketStatement;
  all<T>(): Promise<{ results: T[] }>;
}

export type MarketEnv = Omit<Bindings, 'DB'> & {
  DB: { prepare(sql: string): MarketStatement };
  ASSETS?: { fetch(request: Request): Promise<Response> };
  JOBS_ENABLED?: string;
  ENABLE_JOB_TEST_FIXTURES?: string;
  JOB_EVALUATOR?: string;
  JOB_EVALUATOR_CODE_HASH?: string;
  JOB_PRICE_ATOMIC?: string;
  ESCROW_CODE_HASH?: string;
  ESCROW_IMPLEMENTATION_HASH?: string;
  JOB_CONTEXT_TOKEN?: string;
  JOB_OPERATOR_TOKEN?: string;
};

export const marketEnv = () => bindings() as MarketEnv;

export function publicJson(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export class MarketError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

export function fail(error: unknown) {
  return publicJson(
    { error: error instanceof MarketError ? error.code : 'OPERATION_PENDING' },
    error instanceof MarketError ? error.status : 503,
  );
}

export function requireOrigin(request: Request, env: MarketEnv) {
  if (request.headers.get('origin') !== new URL(env.PUBLIC_ORIGIN).origin)
    throw new MarketError('INVALID_ORIGIN', 403);
}
