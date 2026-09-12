'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { inputSchema, policySchema } from '@private-hire/domain';
import { api, useWallet } from '../../../components/wallet';

export default function NewJob() {
  const { account } = useWallet();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [positions, setPositions] = useState([
    {
      assetId: 'synthetic-usdc',
      quantityAtomic: '1000000',
      quantityDecimals: 6,
      unitPriceMicrousd: '1000000',
    },
  ]);

  async function submit(form: FormData) {
    setBusy(true);
    setError('');
    try {
      const requestId = `job-${crypto.randomUUID()}`;
      const input = inputSchema.parse({
        schemaVersion: 'portfolio-input/v1',
        requestId,
        positions,
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
          ? 'Contracting is not enabled yet. Your wallet has not been charged.'
          : 'The quote could not be saved. Check quantities, duplicate assets and tolerances, then retry.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>Prepare your job</h1>
      <p className="muted">
        Portfolio Calculator · Fixed tariff: 0.01 USDC plus network gas.
      </p>
      {!account ? (
        <p className="notice">Connect your wallet before saving a quote.</p>
      ) : (
        <form action={submit}>
          <h2>Synthetic portfolio</h2>
          <div className="positions">
            {positions.map((p, i) => (
              <div className="position" key={i}>
                <label>
                  Asset
                  <input
                    required
                    value={p.assetId}
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
                  Atomic quantity
                  <input
                    required
                    value={p.quantityAtomic}
                    pattern="0|[1-9][0-9]{0,77}"
                    onChange={(e) =>
                      setPositions((ps) =>
                        ps.map((v, j) =>
                          i === j
                            ? { ...v, quantityAtomic: e.target.value }
                            : v,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Decimals
                  <input
                    type="number"
                    min="0"
                    max="18"
                    value={p.quantityDecimals}
                    onChange={(e) =>
                      setPositions((ps) =>
                        ps.map((v, j) =>
                          i === j
                            ? { ...v, quantityDecimals: Number(e.target.value) }
                            : v,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Price (micro-USD)
                  <input
                    required
                    value={p.unitPriceMicrousd}
                    pattern="0|[1-9][0-9]{0,77}"
                    onChange={(e) =>
                      setPositions((ps) =>
                        ps.map((v, j) =>
                          i === j
                            ? { ...v, unitPriceMicrousd: e.target.value }
                            : v,
                        ),
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  className="secondary"
                  aria-label={`Remove position ${i + 1}`}
                  disabled={positions.length === 1}
                  onClick={() =>
                    setPositions((ps) => ps.filter((_, j) => j !== i))
                  }
                >
                  Remove
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
                  {
                    assetId: '',
                    quantityAtomic: '1',
                    quantityDecimals: 0,
                    unitPriceMicrousd: '1',
                  },
                ])
              }
            >
              Add position
            </button>
          </div>
          <h2>Private evaluation criteria</h2>
          <div className="form-grid">
            <label>
              Value tolerance (micro-USD)
              <input
                name="valueTolerance"
                defaultValue="0"
                required
                pattern="0|[1-9][0-9]{0,77}"
              />
            </label>
            <label>
              Weight tolerance (basis points)
              <input
                name="weightTolerance"
                type="number"
                min="0"
                max="10000"
                defaultValue="0"
                required
              />
            </label>
            <label>
              Time to complete
              <select name="duration" defaultValue="1440">
                <option value="15">15 minutes</option>
                <option value="60">1 hour</option>
                <option value="1440">24 hours</option>
                <option value="10080">7 days</option>
              </select>
            </label>
          </div>
          <p className="notice">
            The provider receives portfolio input. Evaluation tolerances stay
            private to the evaluation route. Price, participants, deadline and
            commitments become public onchain. The backend operator can access
            stored private data.
          </p>
          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}
          <button disabled={busy}>
            {busy ? 'Saving…' : 'Save and review quote'}
          </button>
          <p className="subtle">
            Saving freezes these terms. It does not transfer funds. Changed
            terms require a new quote.
          </p>
        </form>
      )}
    </main>
  );
}
