'use client';

import { useEffect, useState } from 'react';
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
  const { account } = useWallet();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setRows([]);
    if (!account) return;
    setLoading(true);
    setError('');
    api<{ jobs: Row[] }>(`/api/jobs?role=${provider ? 'provider' : 'buyer'}`)
      .then((r) => {
        if (active) setRows(r.jobs);
      })
      .catch(
        () =>
          active &&
          setError(
            'Your analyses could not be loaded. Sign in again or reload to retry.',
          ),
      )
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [account, provider]);

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
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading analyses…</p>
      ) : !account ? (
        <div className="empty">
          <Icon name="wallet" className="empty-icon" />
          <h2>Connect your wallet</h2>
          <p>Sign in to see your analysis requests and private reports.</p>
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
