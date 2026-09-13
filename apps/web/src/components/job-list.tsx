'use client';

import { useQuery } from '@tanstack/react-query';
import { LoadingState, Spinner } from './loading';
import Link from 'next/link';
import { formatUnits } from 'viem';
import { Icon } from './icon';
import { api, useWallet } from './wallet';

export const statuses = [
  'Requested',
  'Payment held',
  'Delivered for review',
  'Accepted',
  'Not accepted',
  'Refunded after expiry',
];

type Row = {
  request_id: string;
  job_id: string | null;
  budget: string;
  expired_at: number;
  chain_status: number | null;
  onchainBudget: string | null;
  refundAvailable: boolean;
};

export function JobList({ provider = false }: { provider?: boolean }) {
  const { account, ready } = useWallet();
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: ['private-jobs', account, provider],
    queryFn: ({ signal }) =>
      api<{ jobs: Row[] }>(
        `/api/jobs?role=${provider ? 'provider' : 'buyer'}`,
        undefined,
        AbortSignal.any([signal, AbortSignal.timeout(15000)]),
      ),
    enabled: ready && !!account,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const rows = account ? (data?.jobs ?? []) : [];
  const loading = !ready || (!!account && isPending);

  return (
    <main>
      <div className="row">
        <div>
          <h1>{provider ? 'Provider workspace' : 'My analyses'}</h1>
          <p className="muted">
            {provider
              ? 'Confirm prices, review reports and deliver analyses to your customers.'
              : 'Track your requests, payments and portfolio reports.'}
          </p>
        </div>
        {!provider && (
          <Link className="button" href="/jobs/new">
            <Icon name="plus" /> Analyze a portfolio
          </Link>
        )}
      </div>
      {loading ? (
        <LoadingState
          label={
            ready ? 'Loading your analyses…' : 'Connecting your workspace…'
          }
        />
      ) : !account ? (
        <div className="empty">
          <Icon name="wallet" className="empty-icon" />
          <h2>Connect your wallet</h2>
          <p>Sign in to see your analysis requests and private reports.</p>
        </div>
      ) : isError && !data ? (
        <div className="empty">
          <Icon name="refresh" className="empty-icon" />
          <h2>We couldn’t load your analyses</h2>
          <p role="alert">
            Your requests are safe. Try again to load this workspace.
          </p>
          <button
            className="secondary"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching && <Spinner />} Try again
          </button>
        </div>
      ) : !rows.length ? (
        <div className="empty">
          <Icon name="report" className="empty-icon" />
          <h2>
            {provider ? 'No requests yet' : 'Your first analysis starts here'}
          </h2>
          <p>
            {provider
              ? 'Customer requests will appear here once they confirm them.'
              : 'Add sample holdings to see their value, portfolio share and largest position.'}
          </p>
          {!provider && (
            <Link className="button" href="/agents">
              Meet Portfolio Calculator
            </Link>
          )}
        </div>
      ) : (
        rows.map((row) => (
          <article className="row" key={row.request_id}>
            <div>
              <Link href={`/jobs/${row.request_id}`}>
                {row.job_id ? `Analysis #${row.job_id}` : 'Draft analysis'} ·
                Portfolio Calculator
              </Link>
              <p className="subtle">
                Deadline: {new Date(row.expired_at * 1000).toLocaleString()}
              </p>
            </div>
            <span>
              Agreed price: {formatUnits(BigInt(row.budget), 6)} USDC
              <br />
              Confirmed price:{' '}
              {row.onchainBudget === null || row.onchainBudget === '0'
                ? 'Not confirmed'
                : `${formatUnits(BigInt(row.onchainBudget), 6)} USDC`}
            </span>
            <span className="badge">
              {row.refundAvailable
                ? 'Refund available'
                : row.chain_status === null
                  ? 'Draft'
                  : statuses[row.chain_status]}
            </span>
          </article>
        ))
      )}
    </main>
  );
}
