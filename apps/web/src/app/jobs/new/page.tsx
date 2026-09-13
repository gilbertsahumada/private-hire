'use client';

import { useState } from 'react';
import { formatUnits } from 'viem';
import { useRouter } from 'next/navigation';
import { inputSchema, policySchema } from '@private-hire/domain';
import metadata from '../../../../public/agent/registration.json';
import { Icon } from '../../../components/icon';
import { portfolioPositions, type Holding } from '../../../lib/portfolio-form';
import { LoadingState, Spinner } from '../../../components/loading';
import { useAgentCatalog } from '../../../components/use-agent-catalog';
import { api, useWallet } from '../../../components/wallet';

export default function NewJob() {
  const { account } = useWallet();
  return <NewJobForm key={account ?? 'signed-out'} />;
}

function NewJobForm() {
  const { account, ready } = useWallet();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const { data: catalog, isError: priceError } = useAgentCatalog();
  const price = catalog?.agents[0]?.price;
  const [requestId] = useState(() => `job-${crypto.randomUUID()}`);
  const [error, setError] = useState('');
  const [positions, setPositions] = useState<Holding[]>([
    { assetId: '', quantity: '', price: '' },
  ]);

  async function submit(form: FormData) {
    setBusy(true);
    setError('');
    try {
      const input = inputSchema.parse({
        schemaVersion: 'portfolio-input/v1',
        requestId,
        positions: portfolioPositions(positions),
      });
      const policy = policySchema.parse({
        schemaVersion: 'portfolio-policy/v1',
        valueToleranceMicrousd: String(form.get('valueTolerance')),
        weightToleranceBps: Number(form.get('weightTolerance')),
      });
      const d = await api<{ request_id: string }>('/api/jobs', {
        requestId,
        input,
        policy,
        durationMinutes: Number(form.get('duration')),
      });
      router.push(`/jobs/${d.request_id}`);
    } catch (e) {
      setError(
        e instanceof Error && e.message === 'CONTRACTING_NOT_ENABLED'
          ? 'Analysis is unavailable right now. Your wallet has not been charged.'
          : e instanceof Error && e.message.startsWith('Asset ')
            ? e.message
            : 'Your analysis could not be saved. Check that each asset has a different name and all amounts are valid, then retry.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <p className="eyebrow">{metadata.name}</p>
      <h1>What’s in your portfolio?</h1>
      <p className="muted">
        Add sample holdings to see their total value and how your portfolio is
        divided. Prices are supplied by you, not fetched from a market.
      </p>
      <p>
        <Icon name="report" /> One report:{' '}
        {price
          ? formatUnits(BigInt(price), 6) + ' USDC'
          : priceError
            ? 'Price unavailable'
            : 'Checking price…'}{' '}
        in test USDC, plus network fees.
      </p>
      {!ready ? (
        <LoadingState label="Connecting your workspace…" detail />
      ) : !account ? (
        <div className="notice">
          <Icon name="wallet" /> Connect your wallet and sign in to save your
          analysis. Signing in does not make a payment.
        </div>
      ) : (
        <form action={submit}>
          <h2>
            <Icon name="chart" /> Your holdings
          </h2>
          <p className="subtle">
            Use up to ten assets. For example, 2.5 units at $10 each have a
            value of $25.
          </p>
          <button
            type="button"
            className="secondary"
            disabled={positions.some((p) => p.assetId || p.quantity || p.price)}
            onClick={() =>
              setPositions([
                { assetId: 'sample-usdc', quantity: '2.5', price: '10' },
              ])
            }
          >
            Use example holdings
          </button>
          <div className="positions">
            {positions.map((position, i) => (
              <div className="position" key={i}>
                <label>
                  Asset name
                  <input
                    required
                    aria-label={`Asset ${i + 1} name`}
                    value={position.assetId}
                    maxLength={128}
                    onChange={(e) =>
                      setPositions((ps) =>
                        ps.map((v, j) =>
                          i === j ? { ...v, assetId: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Quantity
                  <input
                    required
                    aria-label={`Asset ${i + 1} quantity`}
                    inputMode="decimal"
                    value={position.quantity}
                    maxLength={98}
                    onChange={(e) =>
                      setPositions((ps) =>
                        ps.map((v, j) =>
                          i === j ? { ...v, quantity: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Price per unit (USD)
                  <input
                    required
                    aria-label={`Asset ${i + 1} price in USD`}
                    inputMode="decimal"
                    value={position.price}
                    maxLength={98}
                    onChange={(e) =>
                      setPositions((ps) =>
                        ps.map((v, j) =>
                          i === j ? { ...v, price: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="secondary"
                  aria-label={`Remove asset ${i + 1}`}
                  disabled={positions.length === 1}
                  onClick={() =>
                    setPositions((ps) => ps.filter((_, j) => j !== i))
                  }
                >
                  <Icon name="trash" /> Remove
                </button>
              </div>
            ))}
          </div>
          <div className="actions">
            <button
              className="secondary"
              type="button"
              disabled={positions.length === 10}
              onClick={() =>
                setPositions((ps) => [
                  ...ps,
                  { assetId: '', quantity: '', price: '' },
                ])
              }
            >
              <Icon name="plus" /> Add an asset
            </button>
          </div>
          <h2>
            <Icon name="clock" /> Choose a deadline
          </h2>
          <label>
            How long can the provider take?
            <select name="duration" defaultValue="1440">
              <option value="15">15 minutes</option>
              <option value="60">1 hour</option>
              <option value="1440">24 hours</option>
              <option value="10080">7 days</option>
            </select>
          </label>
          <p className="subtle">
            The demo is run by an operator, so delivery is not instant. If
            funded work is still unfinished at the deadline, you can request a
            refund.
          </p>
          <details>
            <summary>Advanced: calculation checks</summary>
            <p>
              By default, the report must match the recalculated values exactly.
              These optional tolerances allow small differences. They are hidden
              from the provider, but visible to the app operator.
            </p>
            <div className="form-grid">
              <label>
                Allowed value difference (micro-USD)
                <input
                  name="valueTolerance"
                  defaultValue="0"
                  required
                  pattern="0|[1-9][0-9]{0,77}"
                />
                <span className="subtle">
                  1 micro-USD = $0.000001. Leave at 0 for an exact match.
                </span>
              </label>
              <label>
                Allowed share difference (basis points)
                <input
                  name="weightTolerance"
                  type="number"
                  min="0"
                  max="10000"
                  defaultValue="0"
                  required
                />
                <span className="subtle">
                  100 basis points = one percentage point. Leave at 0 for an
                  exact match.
                </span>
              </label>
            </div>
          </details>
          <div className="notice">
            <strong>
              <Icon name="lock" /> What is shared?
            </strong>
            <p>
              The provider receives your holdings and prices. The payment
              amount, wallet addresses, deadline and proof hashes are public.
              Your holdings, report and checking criteria are stored encrypted;
              the app operator can access them.
            </p>
          </div>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          <button disabled={busy}>
            <>{busy ? <Spinner /> : <Icon name="report" />}</>{' '}
            {busy ? 'Saving your analysis…' : 'Review my analysis'}
          </button>
          <p className="subtle">
            This saves your request and price for review. No funds are
            transferred. To change the details later, start a new request.
          </p>
        </form>
      )}
    </main>
  );
}
