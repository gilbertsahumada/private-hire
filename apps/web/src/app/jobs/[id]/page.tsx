'use client';

import { use, useEffect, useState } from 'react';
import { formatEther, formatUnits } from 'viem';
import { api, useWallet } from '../../../components/wallet';
import { Icon } from '../../../components/icon';
import { PortfolioReport } from '../../../components/portfolio-report';
import { inputSchema } from '@private-hire/domain';
import metadata from '../../../../public/agent/registration.json';
import Link from 'next/link';
import { statuses } from '../../../components/job-list';

const actionLabels: Record<string, string> = {
  create: 'Confirm your analysis request',
  budget: 'Confirm the analysis price',
  approve: 'Allow the exact payment amount',
  fund: 'Place payment in the contract',
  submit: 'Deliver your report',
  refund: 'Request your refund',
};
const eventLabels: Record<string, string> = {
  JobCreated: 'Analysis requested',
  BudgetSet: 'Price confirmed',
  JobFunded: 'Payment deposited',
  JobSubmitted: 'Report delivered',
  JobCompleted: 'Report accepted · provider paid',
  JobRejected: 'Report not accepted · payment returned',
  JobExpired: 'Deadline passed · payment returned',
};

type Job = {
  providerAutomationEnabled?: boolean;
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
  const [progress, setProgress] = useState('');
  const [pendingHash, setPendingHash] = useState<string | null>(null);
  const [transactionNotice, setTransactionNotice] = useState('');
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [result, setResult] = useState<unknown>(null);

  async function refresh() {
    try {
      const result = await api<Job>(`/api/jobs/${id}`);
      setJob(result);
      setLoadedFor(wallet.account);
    } catch {
      setError(
        'This analysis could not be loaded. Check your account and retry.',
      );
    }
  }

  useEffect(() => {
    setJob(null);
    setResult(null);
    setPrepared(null);
    setPendingHash(null);
    setTransactionNotice('');
    if (!wallet.account) return;
    setPendingHash(localStorage.getItem(`job-tx:${id}`));
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);

    return () => clearInterval(timer);
  }, [id, wallet.account]);

  useEffect(() => {
    if (!wallet.account || !job) return;
    const hash = pendingHash ?? job.pending_tx;
    if (!hash) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    setTransactionNotice('Transaction sent. Waiting for confirmation on Arc…');

    async function checkReceipt() {
      try {
        const receipt = await api<{ confirmed: boolean; reverted?: boolean }>(
          `/api/jobs/${id}/confirm-tx`,
          { hash },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (!receipt.confirmed && !receipt.reverted) throw new Error('Pending');
        setError('');
        setTransactionNotice(
          receipt.reverted
            ? 'Transaction reverted. Your action did not complete. Review it before trying again.'
            : 'Transaction confirmed on Arc. Updating your request…',
        );
        const updated = await api<Job>(
          `/api/jobs/${id}`,
          undefined,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        if (localStorage.getItem(`job-tx:${id}`) === hash)
          localStorage.removeItem(`job-tx:${id}`);
        setPendingHash(null);
        setJob(updated);
        setLoadedFor(wallet.account);
        setTransactionNotice(
          receipt.reverted
            ? 'Transaction reverted. Review the action before trying again.'
            : updated.chain_status === 1
              ? 'Payment confirmed. Your funds are held in the contract while the agent completes your analysis.'
              : 'Transaction confirmed on Arc. You can continue with the next step.',
        );
      } catch {
        if (controller.signal.aborted) return;
        failures += 1;
        if (failures >= 10)
          setTransactionNotice(
            'Confirmation is taking longer than usual or the network cannot be reached. We are still checking. Do not send the payment again.',
          );
        timer = setTimeout(() => void checkReceipt(), 3000);
      }
    }

    void checkReceipt();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, wallet.account, pendingHash, job?.pending_tx, !!job]);

  async function prepare(action: string) {
    setBusy(true);
    setError('');
    try {
      const pending = localStorage.getItem(`job-tx:${id}`) ?? job?.pending_tx;
      if (pending) {
        setProgress('Checking your previous transaction…');
        await confirm(pending);
      }
      setPrepared(await api<Prepared>(`/api/jobs/${id}/prepare`, { action }));
    } catch (e) {
      setError(
        `Action unavailable: ${e instanceof Error ? e.message : 'retry after refreshing'}`,
      );
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function confirm(hash: string) {
    const receipt = await api<{ reverted?: boolean }>(
      `/api/jobs/${id}/confirm-tx`,
      { hash },
    );
    localStorage.removeItem(`job-tx:${id}`);
    setPendingHash(null);
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
    setProgress('Checking payment details…');
    try {
      // Refresh the reviewed action immediately before wallet submission.
      const latest = await api<Prepared>(`/api/jobs/${id}/prepare`, {
        action: prepared.action,
      });
      if (latest.data !== prepared.data || latest.to !== prepared.to)
        throw new Error('Terms changed. Review the action again.');
      setProgress('Open MetaMask to review and confirm the transaction.');
      const hash = await wallet.send(latest);
      localStorage.setItem(`job-tx:${id}`, hash);
      setPendingHash(hash);
      setTransactionNotice(
        'Transaction sent. Waiting for confirmation on Arc…',
      );
      setPrepared(null);
      if (prepared.action === 'create')
        await api(`/api/jobs/${id}/pending-tx`, { hash });
    } catch {
      if (!localStorage.getItem(`job-tx:${id}`))
        setError(
          'Signature was cancelled, or the transaction needs checking. Payment is only shown as received after confirmation.',
        );
    } finally {
      setBusy(false);
      setProgress('');
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

  const holdings = inputSchema.safeParse(job?.input);

  return (
    <main>
      <h1>{job?.job_id ? `Analysis #${job.job_id}` : 'Review your quote'}</h1>
      <p className="muted">
        {metadata.name} · Follow your request, payment and report here.
      </p>
      {error && (
        <p role="status" className="notice error">
          {error}
        </p>
      )}
      {!wallet.account ? (
        <p className="notice">
          Sign in with the wallet that requested or provides this analysis.
        </p>
      ) : !job ? (
        <button onClick={() => void refresh()}>Retry loading</button>
      ) : (
        <>
          {job.chain_status === null && (
            <section className="panel">
              <h2>
                <Icon name="report" /> Your draft is saved
              </h2>
              <p>
                Saving this draft does not send a payment or start the analysis.
              </p>
              <p>
                {job.pending_tx
                  ? 'Your request transaction is awaiting verification. Check it before signing again.'
                  : expired
                    ? 'This draft’s deadline has passed. Start a new request to choose a new deadline.'
                    : 'Review your holdings below, then confirm the request in your wallet. This first transaction has a network fee. After the provider confirms the price, you can make the analysis payment.'}
              </p>
              <Link href="/jobs/new">
                Start a new request with different details
              </Link>
            </section>
          )}
          {holdings.success && (
            <section className="panel">
              <h2>Your requested holdings</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Quantity</th>
                      <th>Price per unit (USD)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {holdings.data.positions.map((p) => (
                      <tr key={p.assetId}>
                        <td>{p.assetId}</td>
                        <td>
                          {formatUnits(
                            BigInt(p.quantityAtomic),
                            p.quantityDecimals,
                          )}
                        </td>
                        <td>${formatUnits(BigInt(p.unitPriceMicrousd), 6)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="subtle">
                These are the inputs you supplied, not a completed report.
              </p>
            </section>
          )}
          <ol className="timeline">
            {[
              'Draft',
              ...statuses.slice(0, 3),
              job.chain_status !== null && job.chain_status >= 3
                ? statuses[job.chain_status]
                : 'Accepted',
            ].map((s, i) => (
              <li
                key={s}
                className={
                  (
                    job.chain_status === null
                      ? i === 0
                      : i === Math.min(job.chain_status + 1, 4)
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
            <dt>Price confirmed by provider</dt>
            <dd>
              {job.onchainBudget === null || job.onchainBudget === '0'
                ? 'Not confirmed'
                : `${formatUnits(BigInt(job.onchainBudget), 6)} USDC`}
            </dd>
            <dt>Deadline</dt>
            <dd>{new Date(job.expired_at * 1000).toLocaleString()}</dd>
            <dt>What happens next</dt>
            <dd>
              {job.chain_status === 3
                ? 'Your report was accepted and the provider was paid.'
                : job.chain_status === 4
                  ? 'The report did not pass the checks. Your payment was returned.'
                  : job.chain_status === 5
                    ? 'Your payment was returned after the deadline.'
                    : job.refundAvailable
                      ? 'The deadline has passed. You can request your refund.'
                      : job.attempts?.[0]?.state === 'running'
                        ? job.attempts[0].phase === 'dispatch'
                          ? 'Calculating your portfolio'
                          : 'Checking the report · CRE simulation'
                        : job.task?.state === 'ready'
                          ? 'Report prepared for delivery'
                          : job.chain_status === 1
                            ? 'Waiting for the operator to start the analysis'
                            : job.chain_status === 2
                              ? 'Waiting for the operator to check the report'
                              : job.chain_status === null
                                ? 'Review your draft and confirm the request in your wallet.'
                                : job.onchainBudget === job.budget
                                  ? 'The price is confirmed. Review and deposit your payment.'
                                  : 'Waiting for the provider to confirm the price.'}
            </dd>
          </dl>
          {job.chain_status === 0 && job.onchainBudget === '0' && (
            <p className="notice">
              The provider needs to confirm your price before you can pay.
            </p>
          )}
          {job.refundAvailable && (
            <p className="notice">
              Refund available. Funds are returned only after the refund
              transaction confirms.
            </p>
          )}
          {provider && job.chain_status !== null && job.chain_status < 2 && (
            <p className="notice">
              {job.providerAutomationEnabled
                ? 'The provider service handles price confirmation and report delivery. No seller wallet action is needed here.'
                : 'Automatic signing is not activated yet. This workspace is for monitoring; the provider service will confirm prices and deliver reports.'}
            </p>
          )}
          <div className="actions">
            {buyer &&
              job.chain_status === null &&
              !job.pending_tx &&
              !expired && (
                <button disabled={busy} onClick={() => void prepare('create')}>
                  <Icon name="check" /> Confirm analysis request
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
                    Allow this payment amount
                  </button>
                  <button
                    disabled={busy || !!pendingHash || !!job.pending_tx}
                    onClick={() => void prepare('fund')}
                  >
                    <Icon name="wallet" /> Review payment
                  </button>
                </>
              )}
            {buyer && job.refundAvailable && (
              <button disabled={busy} onClick={() => void prepare('refund')}>
                <Icon name="wallet" /> Request refund
              </button>
            )}
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void recover()}
            >
              <Icon name="refresh" /> Check transaction
            </button>
          </div>
          {transactionNotice && (
            <section className="panel" role="status" aria-live="polite">
              <h2>
                {pendingHash || job.pending_tx
                  ? 'Waiting for network confirmation'
                  : 'Transaction status'}
              </h2>
              <p>{transactionNotice}</p>
              {(pendingHash ?? job.pending_tx) && (
                <a
                  href={`https://testnet.arcscan.app/tx/${pendingHash ?? job.pending_tx}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View transaction on Arc explorer
                </a>
              )}
            </section>
          )}
          {busy && progress && (
            <p role="status" className="notice">
              {progress}
            </p>
          )}
          {prepared && (
            <section className="panel">
              <h2>{actionLabels[prepared.action] ?? 'Review transaction'}</h2>
              {error && (
                <p role="status" className="notice error">
                  {error}
                </p>
              )}
              <p>
                Estimated network fee:{' '}
                {formatEther(BigInt(prepared.estimatedFeeWei))} USDC. Your
                wallet shows the final fee.
              </p>
              <p>
                {prepared.action === 'create'
                  ? 'This records your request. The analysis price is not paid yet; a network fee applies.'
                  : prepared.action === 'approve'
                    ? 'This lets the contract use exactly the agreed USDC amount. The payment is deposited in the next step.'
                    : prepared.action === 'fund'
                      ? 'Your payment is held in the contract while the analysis is completed and checked.'
                      : prepared.action === 'submit'
                        ? 'This commits your prepared report for checking. It does not mean the report has been accepted.'
                        : prepared.action === 'refund'
                          ? 'Your funds are returned once this transaction is confirmed.'
                          : 'Confirm the agreed price so the customer can make the payment.'}
              </p>
              <details>
                <summary>Transaction details</summary>
                <p className="subtle">Contract address: {prepared.to}</p>
              </details>
              <button disabled={busy} onClick={() => void sign()}>
                <Icon name="wallet" /> Confirm in wallet
              </button>
              <button className="secondary" onClick={() => setPrepared(null)}>
                Cancel
              </button>
            </section>
          )}
          <details>
            <summary>Contract and request details</summary>
            <p>Request fingerprint: {job.manifest_hash}</p>
            <p>
              Evaluation is performed using CRE simulation, started by an
              operator.
            </p>
          </details>
          <details>
            <summary>Your holdings · technical data</summary>
            <pre>{JSON.stringify(job.input, null, 2)}</pre>
          </details>
          {job.policy && (
            <details>
              <summary>Your private calculation checks</summary>
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
                <Icon name="report" /> View portfolio report
              </button>
              {result !== null && <PortfolioReport value={result} />}
            </>
          )}
          {!!job.reports?.length && (
            <section className="panel">
              <h2>Report verification</h2>
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
                    View verification transaction
                  </a>
                </div>
              ))}
            </section>
          )}
          <h2>Confirmed activity</h2>
          {!job.events.length ? (
            <p className="muted">No confirmed activity to show yet.</p>
          ) : (
            job.events.map((e, i) => (
              <div className="row" key={`${e.tx_hash}-${i}`}>
                <span>{eventLabels[e.event_name] ?? e.event_name}</span>
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
