'use client';

import { use, useEffect, useState } from 'react';
import { formatEther, formatUnits } from 'viem';
import { api, useWallet } from '../../../components/wallet';
import { statuses } from '../../../components/job-list';

type Job = {
  request_id: string;
  job_id: string | null;
  buyer: string;
  provider: string;
  budget: string;
  onchainBudget: string | null;
  expired_at: number;
  chain_status: number | null;
  manifest_hash: string;
  pending_tx: string | null;
  refundAvailable: boolean;
  task: { state: string; result_hash: string } | null;
  events: { tx_hash: string; event_name: string; block_number: string }[];
  input: unknown;
  policy?: unknown;
  reports: { hash: string; decision: number; txHash: string }[];
  attempts: { phase: string; state: string; updated_at: number }[];
};

type Prepared = {
  from: string;
  to: string;
  data: string;
  chainId: number;
  estimatedFeeWei: string;
  action: string;
};

export default function JobDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const wallet = useWallet();
  const [loadedJob, setJob] = useState<Job | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const job = loadedFor === wallet.account ? loadedJob : null;
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [result, setResult] = useState<unknown>(null);

  async function refresh() {
    try {
      const result = await api<Job>(`/api/jobs/${id}`);
      setJob(result);
      setLoadedFor(wallet.account);
    } catch {
      setError('This job could not be loaded. Check your account and retry.');
    }
  }

  useEffect(() => {
    setJob(null);
    setResult(null);
    setPrepared(null);
    if (!wallet.account) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);

    return () => clearInterval(timer);
  }, [id, wallet.account]);

  async function prepare(action: string) {
    setBusy(true);
    setError('');
    try {
      setPrepared(await api<Prepared>(`/api/jobs/${id}/prepare`, { action }));
    } catch (e) {
      setError(
        `Action unavailable: ${e instanceof Error ? e.message : 'retry after refreshing'}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm(hash: string) {
    const receipt = await api<{ reverted?: boolean }>(
      `/api/jobs/${id}/confirm-tx`,
      { hash },
    );
    localStorage.removeItem(`job-tx:${id}`);
    await refresh();
    if (receipt.reverted)
      setError('Transaction reverted. You can review and retry the action.');
  }

  async function sign() {
    if (!prepared) return;
    if (localStorage.getItem(`job-tx:${id}`)) {
      setError('Check the pending transaction before signing again.');

      return;
    }
    setBusy(true);
    setError('');
    try {
      // Refresh the reviewed action immediately before wallet submission.
      const latest = await api<Prepared>(`/api/jobs/${id}/prepare`, {
        action: prepared.action,
      });
      if (latest.data !== prepared.data || latest.to !== prepared.to)
        throw new Error('Terms changed. Review the action again.');
      const hash = await wallet.send(latest);
      localStorage.setItem(`job-tx:${id}`, hash);
      if (prepared.action === 'create')
        await api(`/api/jobs/${id}/pending-tx`, { hash });
      setPrepared(null);
      setError('Transaction sent. Use Check transaction after confirmation.');
    } catch {
      setError(
        'Signature was cancelled, or the transaction needs checking. No job is marked paid without confirmation.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function recover() {
    setBusy(true);
    try {
      const hash = localStorage.getItem(`job-tx:${id}`) ?? job?.pending_tx;
      if (hash) {
        await confirm(hash);
      } else await refresh();
    } catch {
      setError(
        'Transaction is pending or could not be verified. Retry without signing again.',
      );
    } finally {
      setBusy(false);
    }
  }

  const buyer = job?.buyer === wallet.account;
  const provider = job?.provider === wallet.account;
  const expired = !!job && Date.now() / 1000 >= job.expired_at;

  return (
    <main>
      <h1>{job?.job_id ? `Job #${job.job_id}` : 'Review your quote'}</h1>
      <p className="muted">Portfolio Calculator · CRE simulation</p>
      {error && (
        <p role="status" className="notice error">
          {error}
        </p>
      )}
      {!wallet.account ? (
        <p className="notice">
          Connect a participating wallet to view this job.
        </p>
      ) : !job ? (
        <button onClick={() => void refresh()}>Retry loading</button>
      ) : (
        <>
          <ol className="timeline">
            {['Draft', ...statuses].map((s, i) => (
              <li
                key={s}
                className={
                  (
                    job.chain_status === null
                      ? i === 0
                      : i === job.chain_status + 1
                  )
                    ? 'current'
                    : ''
                }
              >
                {s}
              </li>
            ))}
          </ol>
          <dl className="facts">
            <dt>Agreed price</dt>
            <dd>{formatUnits(BigInt(job.budget), 6)} USDC</dd>
            <dt>Onchain budget</dt>
            <dd>
              {job.onchainBudget === null
                ? 'Not created'
                : `${formatUnits(BigInt(job.onchainBudget), 6)} USDC`}
            </dd>
            <dt>Deadline</dt>
            <dd>{new Date(job.expired_at * 1000).toLocaleString()}</dd>
            <dt>Manifest</dt>
            <dd>{job.manifest_hash}</dd>
            <dt>Work status</dt>
            <dd>
              {job.attempts?.[0]?.state === 'running'
                ? job.attempts[0].phase === 'dispatch'
                  ? 'Agent running'
                  : 'Evaluating · CRE simulation'
                : job.task?.state === 'ready'
                  ? 'Result ready'
                  : job.chain_status === 1
                    ? 'Awaiting operator dispatch'
                    : job.chain_status === 2
                      ? 'Awaiting operator evaluation'
                      : 'Not running'}
            </dd>
          </dl>
          {job.chain_status === 0 && job.onchainBudget === '0' && (
            <p className="notice">
              Awaiting provider confirmation of the fixed budget.
            </p>
          )}
          {job.refundAvailable && (
            <p className="notice">
              Refund available. Funds are returned only after the refund
              transaction confirms.
            </p>
          )}
          <div className="actions">
            {buyer && job.chain_status === null && !job.pending_tx && (
              <button disabled={busy} onClick={() => void prepare('create')}>
                Review job creation
              </button>
            )}
            {provider && job.chain_status === 0 && !expired && (
              <button disabled={busy} onClick={() => void prepare('budget')}>
                Confirm fixed budget
              </button>
            )}
            {buyer &&
              job.chain_status === 0 &&
              job.onchainBudget === job.budget &&
              !expired && (
                <>
                  <button
                    disabled={busy}
                    onClick={() => void prepare('approve')}
                  >
                    Approve exact USDC amount
                  </button>
                  <button disabled={busy} onClick={() => void prepare('fund')}>
                    Review funding
                  </button>
                </>
              )}
            {provider &&
              job.chain_status === 1 &&
              job.task?.state === 'ready' &&
              !expired && (
                <button disabled={busy} onClick={() => void prepare('submit')}>
                  Review delivery submission
                </button>
              )}
            {buyer && job.refundAvailable && (
              <button disabled={busy} onClick={() => void prepare('refund')}>
                Claim refund
              </button>
            )}
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void recover()}
            >
              Check transaction
            </button>
          </div>
          {prepared && (
            <section className="panel">
              <h2>Review {prepared.action}</h2>
              <p>
                Network gas estimate:{' '}
                {formatEther(BigInt(prepared.estimatedFeeWei))} USDC. Your
                wallet shows the final fee.
              </p>
              <p className="subtle">Destination: {prepared.to}</p>
              <button disabled={busy} onClick={() => void sign()}>
                Sign in wallet
              </button>
              <button className="secondary" onClick={() => setPrepared(null)}>
                Cancel
              </button>
            </section>
          )}
          <details>
            <summary>Portfolio input</summary>
            <pre>{JSON.stringify(job.input, null, 2)}</pre>
          </details>
          {job.policy && (
            <details>
              <summary>Private evaluation criteria</summary>
              <pre>{JSON.stringify(job.policy, null, 2)}</pre>
            </details>
          )}
          {job.task?.state === 'ready' && (
            <>
              <button
                className="secondary"
                onClick={() =>
                  api(`/api/jobs/${id}/result`)
                    .then(setResult)
                    .catch(() => setError('Result recovery is pending. Retry.'))
                }
              >
                View recovered result
              </button>
              {result !== null && <pre>{JSON.stringify(result, null, 2)}</pre>}
            </>
          )}
          {!!job.reports?.length && (
            <section className="panel">
              <h2>Public evaluation report</h2>
              {job.reports.map((r) => (
                <div key={r.hash}>
                  <p>
                    {r.decision === 1 ? 'Accepted' : 'Rejected'} · CRE
                    simulation
                  </p>
                  <p className="subtle">{r.hash}</p>
                  <a
                    href={`https://testnet.arcscan.app/tx/${r.txHash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View evaluator receipt
                  </a>
                </div>
              ))}
            </section>
          )}
          <h2>Confirmed activity</h2>
          {!job.events.length ? (
            <p className="muted">No confirmed job transactions yet.</p>
          ) : (
            job.events.map((e, i) => (
              <div className="row" key={`${e.tx_hash}-${i}`}>
                <span>{e.event_name}</span>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`https://testnet.arcscan.app/tx/${e.tx_hash}`}
                >
                  View transaction
                </a>
              </div>
            ))
          )}
        </>
      )}
    </main>
  );
}
