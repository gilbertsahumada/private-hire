'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatUnits } from 'viem';
import { api } from '../../components/wallet';

type Agent = {
  name: string;
  wallet: string;
  walletExplorerUrl: string;
  price: string;
  stale: boolean;
  identityVerified: boolean;
  enabled: boolean;
  availabilityReason: string;
  trustUrl: string;
};

export default function Agents() {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [error, setError] = useState('');

  const load = () => {
    setError('');
    api<{ agents: Agent[] }>('/api/agents')
      .then((r) => setAgent(r.agents[0]))
      .catch(() =>
        setError('Agent availability could not be checked. Try again.'),
      );
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <main>
      <div className="badges">
        <span className="badge">Arc Testnet</span>
        <span className="badge">Deterministic calculation</span>
      </div>
      <div className="agent-layout">
        <section>
          <div className="agent-heading">
            <img
              className="avatar"
              src="/agent/portfolio-calculator.svg"
              alt="Portfolio Calculator avatar"
            />
            <div>
              <h1>Portfolio Calculator</h1>
              <a
                href="https://trust8004.xyz/agents/5042002:894552"
                target="_blank"
                rel="noreferrer"
              >
                ERC-8004 identity #894552
              </a>
            </div>
          </div>
          <p className="muted">
            Turn a synthetic portfolio into precise values, position weights and
            concentration. Agree on the work, fund the job, and follow its
            delivery.
          </p>
          <dl className="facts">
            <dt>Input</dt>
            <dd>Up to ten positions with quantities and supplied prices</dd>
            <dt>Delivery</dt>
            <dd>Structured report with exact integer calculations</dd>
            <dt>Identity</dt>
            <dd>
              {agent?.identityVerified
                ? 'Registry and payment wallet verified'
                : agent
                  ? 'Verification unavailable'
                  : 'Checking registry…'}
            </dd>
            <dt>Evaluation</dt>
            <dd>CRE simulation, operated manually</dd>
            <dt>Provider wallet</dt>
            <dd>
              {agent ? (
                <a
                  href={agent.walletExplorerUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {agent.wallet}
                </a>
              ) : (
                'Checking…'
              )}
            </dd>
          </dl>
          <div className="features">
            <div>
              <h3>Values</h3>
              <p className="muted">Individual and total values in micro-USD.</p>
            </div>
            <div>
              <h3>Weights</h3>
              <p className="muted">Position weights in basis points.</p>
            </div>
            <div>
              <h3>Concentration</h3>
              <p className="muted">The largest position’s portfolio weight.</p>
            </div>
          </div>
        </section>
        <aside className="panel">
          <h2>One report</h2>
          <p className="price">
            {agent ? formatUnits(BigInt(agent.price), 6) : '0.01'}{' '}
            <small>USDC</small>
          </p>
          <p className="muted">
            Fixed job price. Network gas is estimated separately before signing.
          </p>
          {agent?.enabled ? (
            <Link className="button" href="/jobs/new">
              Create a job
            </Link>
          ) : (
            <>
              <button disabled>Contracting not enabled</button>
              <p className="subtle">
                {agent?.availabilityReason === 'CONTRACTING_NOT_ENABLED'
                  ? 'Testnet hiring has not been activated.'
                  : 'Live network checks must succeed before you can create or fund a job.'}
              </p>
            </>
          )}
          <hr />
          <p className="subtle">
            Inputs and results are stored encrypted. The backend operator can
            access stored data. Registry identity does not certify a live
            enclave.
          </p>
          {agent &&
            !agent.enabled &&
            agent.availabilityReason !== 'CONTRACTING_NOT_ENABLED' && (
              <div className="notice">
                <p>
                  Live identity or contract verification is temporarily
                  unavailable. Hiring stays disabled until a fresh check
                  succeeds.
                </p>
                <button className="secondary" onClick={load}>
                  Retry verification
                </button>
              </div>
            )}
          {agent?.stale && (
            <p className="notice">
              Discovery data may be outdated. Onchain verification is shown
              separately.
            </p>
          )}
          {error && (
            <div role="alert">
              <p>{error}</p>
              <button className="secondary" onClick={load}>
                Retry
              </button>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
