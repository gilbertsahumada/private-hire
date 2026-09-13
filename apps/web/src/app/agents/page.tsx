'use client';

import Link from 'next/link';
import { formatUnits } from 'viem';
import { Icon } from '../../components/icon';
import { LoadingState, Spinner } from '../../components/loading';
import { useAgentCatalog } from '../../components/use-agent-catalog';

export default function Agents() {
  const { data, isPending, isFetching, isError, refetch } = useAgentCatalog();
  const agents = data?.agents ?? [];

  return (
    <main className="agent-directory">
      <div className="directory-heading">
        <div>
          <h1>Find your next agent.</h1>
          <p className="muted">
            Explore what’s possible. Choose an agent and see how it works.
          </p>
        </div>
        <Link className="directory-provider-link" href="/provider">
          Building an agent? <Icon name="arrow" />
        </Link>
      </div>
      <div className="directory-toolbar">
        <span>
          All agents{' '}
          <span className="directory-count">
            {isPending ? '…' : agents.length}
          </span>
        </span>
        <span className="subtle">
          {isFetching && data ? (
            <>
              <Spinner /> Updating catalog…
            </>
          ) : (
            'Discover the growing catalog'
          )}
        </span>
      </div>
      {isPending ? (
        <LoadingState label="Loading agents…" />
      ) : isError && !data ? (
        <div className="empty">
          <h2>The catalog couldn’t be loaded</h2>
          <p role="alert">Try again to see the listed agents.</p>
          <button
            className="secondary"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching && <Spinner />} Retry
          </button>
        </div>
      ) : !agents.length ? (
        <div className="empty">
          <Icon name="agent" className="empty-icon" />
          <h2>New agents are on their way</h2>
          <p>Check back to discover what they can do.</p>
        </div>
      ) : (
        <>
          {isError && (
            <p className="notice" role="status">
              Couldn’t refresh the catalog. Showing the last loaded agents.{' '}
              <button className="text-button" onClick={() => void refetch()}>
                Try again
              </button>
            </p>
          )}
          <div className="agent-grid">
            {agents.map((agent) => (
              <article className="agent-card" key={agent.agentId}>
                <div className="agent-card-top">
                  {agent.image ? (
                    <img
                      className="agent-card-avatar"
                      src={agent.image}
                      alt=""
                      width="64"
                      height="64"
                    />
                  ) : (
                    <div className="agent-card-avatar agent-card-fallback">
                      <Icon name="agent" />
                    </div>
                  )}
                  <span
                    className={`agent-availability ${agent.enabled ? 'available' : ''}`}
                  >
                    <span aria-hidden="true" />
                    {agent.enabled ? 'Available' : 'Unavailable'}
                  </span>
                </div>
                <h2>
                  <Link href={`/agents/${encodeURIComponent(agent.agentId)}`}>
                    {agent.name}
                  </Link>
                </h2>
                <p className="agent-card-description">{agent.description}</p>
                <div className="agent-card-bottom">
                  <span>
                    <strong>{formatUnits(BigInt(agent.price), 6)} USDC</strong>
                    <small>per request</small>
                  </span>
                  <Link
                    className="button secondary"
                    href={`/agents/${encodeURIComponent(agent.agentId)}`}
                    aria-label={`View ${agent.name}`}
                  >
                    View agent <Icon name="arrow" />
                  </Link>
                </div>
              </article>
            ))}
          </div>
          <div className="directory-note">
            <Icon name="agent" />
            <p>
              <strong>This is just the beginning.</strong> More agents will join
              the catalog as new services become available.
            </p>
          </div>
        </>
      )}
    </main>
  );
}
