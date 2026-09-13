export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

export async function api<T>(
  url: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    signal,
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new ApiError(response.status, 'INVALID_RESPONSE');
  }
  if (!response.ok)
    throw new ApiError(
      response.status,
      typeof result?.error === 'string' ? result.error : 'REQUEST_FAILED',
    );
  return result;
}

// Only attach this policy to reads. Never repeat wallet or payment operations.
export function retryJobRead(failures: number, error: Error): boolean {
  if (failures >= 2) return false;
  if (error instanceof ApiError) {
    if (error.code === 'CHAIN_JOB_MISMATCH') return false;
    return [408, 429, 500, 502, 503, 504].includes(error.status);
  }
  return error instanceof TypeError || error.name === 'TimeoutError';
}

export function jobReadMessage(error: Error | null): string {
  if (error instanceof ApiError) {
    if (error.status === 401)
      return 'Your session has expired. Reconnect your wallet to view this analysis.';
    if (error.status === 403)
      return 'This analysis belongs to a different wallet. Connect the wallet used for this request.';
    if (error.status === 404)
      return 'This analysis could not be found. Check the link or return to My requests.';
    if (error.code === 'CHAIN_JOB_MISMATCH')
      return 'We couldn’t verify this request against the contract. Try again later.';
  }
  return 'We’re having trouble reaching the service. Try again in a moment; you don’t need to reload the page.';
}
