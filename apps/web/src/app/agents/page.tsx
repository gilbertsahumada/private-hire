'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatUnits } from 'viem';
import metadata from '../../../public/agent/registration.json';
import { Icon } from '../../components/icon';
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
        <span className="badge">Portfolio analysis demo</span>
      </div>
      <div className="agent-layout">
        <section>
          <div className="agent-heading">
            <img className="avatar" src={metadata.image} alt={metadata.name} />
            <div>
              <h1>{metadata.name}</h1>
              <a
                href="https://trust8004.xyz/agents/5042002:894552"
                target="_blank"
                rel="noreferrer"
              >
                Agent identity #894552
              </a>
            </div>
          </div>
          <p className="muted">{metadata.description}</p>
          <div className="features">
            <div>
              <h3>
                <Icon name="chart" /> Total value
              </h3>
              <p className="muted">
                What each holding is worth and how they add up.
              </p>
            </div>
            <div>
              <h3>
                <Icon name="pie" /> Portfolio mix
              </h3>
              <p className="muted">
                The share of your portfolio held in each asset.
              </p>
            </div>
            <div>
              <h3>
                <Icon name="report" /> Largest holding
              </h3>
              <p className="muted">
                See how much depends on your biggest position.
              </p>
            </div>
          </div>
          <section className="how-it-works">
            <h2>From holdings to a clear report</h2>
            <ol>
              <li>
                <strong>Add your holdings</strong>
                <span>Enter up to ten assets, quantities and prices.</span>
              </li>
              <li>
                <strong>Review the price</strong>
                <span>
                  The provider confirms it before you place your test payment in
                  the contract.
                </span>
              </li>
              <li>
                <strong>Receive your analysis</strong>
                <span>
                  The result is checked against your criteria before the
                  provider is paid.
                </span>
              </li>
            </ol>
            <p className="subtle">
              This demo is started and checked by an operator. Results are not
              instant.
            </p>
          </section>
          <details>
            <summary>About the agent and the technology</summary>
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
            <p className="subtle">
              Identity uses ERC-8004. Registration is not a certification of
              quality or a live secure enclave.
            </p>
          </details>
        </section>
        <aside className="panel">
          <h2>
            <Icon name="report" /> Your portfolio report
          </h2>
          <p className="price">
            {agent ? formatUnits(BigInt(agent.price), 6) : '0.01'}{' '}
            <small>USDC</small>
          </p>
          <p className="muted">
            One analysis, one fixed price. Network fees are shown separately
            before you confirm in your wallet.
          </p>
          {agent?.enabled ? (
            <Link className="button" href="/jobs/new">
              <Icon name="plus" /> Analyze a portfolio
            </Link>
          ) : (
            <>
              <button disabled>
                {agent ? 'Analysis unavailable' : 'Checking availability…'}
              </button>
              <p className="subtle">
                {agent?.availabilityReason === 'CONTRACTING_NOT_ENABLED'
                  ? 'This demo is not accepting requests yet.'
                  : 'We need to confirm the service is available before you can request an analysis.'}
              </p>
            </>
          )}
          <p className="subtle">
            Use test USDC on Arc Testnet. You can review your request before any
            payment.
          </p>
          <hr />
          <p className="subtle">
            <Icon name="lock" /> Your holdings and report are stored encrypted.
            The app operator can access them. Your analysis does not buy, sell
            or move any portfolio assets.
          </p>
          {agent &&
            !agent.enabled &&
            agent.availabilityReason !== 'CONTRACTING_NOT_ENABLED' && (
              <div className="notice">
                <p>
                  We cannot confirm availability right now. Try checking again
                  before starting an analysis.
                </p>
                <button className="secondary" onClick={load}>
                  Check availability
                </button>
              </div>
            )}
          {agent?.stale && (
            <p className="notice">
              Some profile details may be outdated. The agent’s identity is
              checked separately.
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
