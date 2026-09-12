'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatUnits } from 'viem';
import { api, useWallet } from './wallet';

export const statuses = [
  'Created',
  'Funded',
  'Submitted',
  'Completed',
  'Rejected',
  'Expired',
];

type Row = {
  request_id: string;
  job_id: string | null;
  budget: string;
  expired_at: number;
  chain_status: number | null;
};

export function JobList({ provider = false }: { provider?: boolean }) {
  const { account } = useWallet();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setRows([]);
    if (!account) return;
    setLoading(true);
    setError('');
    api<{ jobs: Row[] }>(`/api/jobs?role=${provider ? 'provider' : 'buyer'}`)
      .then((r) => setRows(r.jobs))
      .catch(() =>
        setError('Jobs could not be loaded. Sign in again or reload to retry.'),
      )
      .finally(() => setLoading(false));
  }, [account, provider]);

  return (
    <main>
      <div className="row">
        <div>
          <h1>{provider ? 'Provider workspace' : 'Your jobs'}</h1>
          <p className="muted">
            {provider
              ? 'Confirm the fixed budget, review prepared results and sign your deliveries.'
              : 'Your quotes, funded work and completed deliveries.'}
          </p>
        </div>
        {!provider && (
          <Link className="button" href="/jobs/new">
            Create a job
          </Link>
        )}
      </div>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">Loading jobs…</p>
      ) : !account ? (
        <div className="empty">
          <h2>Connect your wallet</h2>
          <p>Sign in to view the jobs assigned to your account.</p>
        </div>
      ) : !rows.length ? (
        <div className="empty">
          <h2>
            {provider ? 'No assigned jobs yet' : 'Your first job starts here'}
          </h2>
          <p>
            {provider
              ? 'Buyer requests will appear here when created onchain.'
              : 'Choose Portfolio Calculator to prepare a private portfolio calculation.'}
          </p>
          {!provider && (
            <Link className="button" href="/agents">
              View agent
            </Link>
          )}
        </div>
      ) : (
        rows.map((row) => (
          <article className="row" key={row.request_id}>
            <div>
              <Link href={`/jobs/${row.request_id}`}>
                {row.job_id ? `Job #${row.job_id}` : 'Draft quote'} · Portfolio
                Calculator
              </Link>
              <p className="subtle">
                Expires {new Date(row.expired_at * 1000).toLocaleString()}
              </p>
            </div>
            <span>{formatUnits(BigInt(row.budget), 6)} USDC</span>
            <span className="badge">
              {row.chain_status === null ? 'Draft' : statuses[row.chain_status]}
            </span>
          </article>
        ))
      )}
    </main>
  );
}
