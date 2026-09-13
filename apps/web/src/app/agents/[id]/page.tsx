'use client';

import { use } from 'react';
import { LoadingState } from '../../../components/loading';
import Link from 'next/link';
import { formatUnits } from 'viem';
import metadata from '../../../../public/agent/registration.json';
import { Icon } from '../../../components/icon';
import { useAgentCatalog } from '../../../components/use-agent-catalog';
import { Spinner } from '../../../components/loading';

export default function AgentProfile({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, isFetching, isError, refetch } = useAgentCatalog();
  const agent = data?.agents.find((item) => String(item.agentId) === id);
  const error = isError
    ? 'Agent availability could not be checked. Try again.'
    : '';
  const load = () => void refetch();

  if (id !== '894552') {
    return (
      <main>
        <Link className="back-link" href="/agents">
          ← All agents
        </Link>
        {!data && isFetching ? (
          <LoadingState label="Loading agent…" />
        ) : !agent ? (
          <div className="empty">
            <h1>{isError ? 'Couldn’t load this agent' : 'Agent not found'}</h1>
            <p>Return to the catalog to explore the listed agents.</p>
            {isError && <button onClick={load}>Try again</button>}
          </div>
        ) : (
          <section className="panel generic-agent-profile">
            {agent.image && <img className="avatar" src={agent.image} alt="" />}
            <h1>{agent.name}</h1>
            <p className="muted">{agent.description}</p>
            <p>Listed price: {formatUnits(BigInt(agent.price), 6)} USDC</p>
            <a href={agent.trustUrl} target="_blank" rel="noreferrer">
              View agent identity
            </a>
          </section>
        )}
      </main>
    );
  }

  return (
    <main>
      <Link className="back-link" href="/agents">
        ← All agents
      </Link>
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
                View agent identity
              </a>
            </div>
          </div>
          <p className="agent-intro">
            Understand what your portfolio is worth, how it is split, and where
            your largest exposure is.
          </p>
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
          <section className="agent-input-summary">
            <h2>What you’ll need</h2>
            <p>
              Add up to ten assets with the quantity you hold and a price in USD
              for each. The report uses the prices you provide.
            </p>
          </section>
          <section className="how-it-works">
            <h2>Three steps to your report</h2>
            <ol>
              <li>
                <strong>Add your holdings</strong>
                <span>Enter your assets or try the example.</span>
              </li>
              <li>
                <strong>Review and confirm</strong>
                <span>
                  Check your request and the final price before paying.
                </span>
              </li>
              <li>
                <strong>Open your report</strong>
                <span>Find your analysis in My requests once it is ready.</span>
              </li>
            </ol>
            <p className="subtle">
              In this demo, an operator runs and checks each analysis. Results
              are not instant.
            </p>
          </section>
        </section>
        <aside className="panel availability-panel">
          <h2>
            <Icon name="report" /> Your portfolio report
          </h2>
          <p className="price">
            {agent ? (
              formatUnits(BigInt(agent.price), 6)
            ) : isFetching ? (
              <span
                className="skeleton price-skeleton"
                aria-label="Checking price"
              />
            ) : (
              <span aria-label="Price unavailable">—</span>
            )}{' '}
            <small>USDC</small>
          </p>
          <p className="muted">
            Per report. Review the final price and network fees before you pay.
          </p>
          <div className="availability-action">
            {agent?.enabled ? (
              <Link className="button" href="/jobs/new">
                <Icon name="plus" /> Analyze a portfolio
              </Link>
            ) : (
              <button disabled aria-busy={isFetching}>
                {isFetching && <Spinner />}
                {isFetching ? 'Checking availability…' : 'Analysis unavailable'}
              </button>
            )}
            <p className="subtle availability-hint">
              {agent?.enabled
                ? 'Start with your holdings. Payment comes later.'
                : agent?.availabilityReason === 'CONTRACTING_NOT_ENABLED'
                  ? 'This demo is not accepting requests yet.'
                  : 'Availability is checked before you can request an analysis.'}
            </p>
          </div>
          <p className="subtle">Demo payment with test USDC on Arc Testnet.</p>
          <hr />
          <p className="subtle">
            <Icon name="lock" /> Your holdings and report are stored encrypted.
            The app operator can access them. This service only calculates a
            report; your assets stay where they are.
          </p>
          {agent &&
            !agent.enabled &&
            agent.availabilityReason !== 'CONTRACTING_NOT_ENABLED' && (
              <div className="notice">
                <p>
                  We cannot confirm availability right now. Try checking again
                  before starting an analysis.
                </p>
                <button
                  className="secondary"
                  disabled={isFetching}
                  onClick={load}
                >
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
          {error && !isFetching && (
            <div role="alert">
              <p>{error}</p>
              <button
                className="secondary"
                disabled={isFetching}
                onClick={load}
              >
                Retry
              </button>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
