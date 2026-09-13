import { resultSchema } from '@private-hire/domain';
import { formatUnits } from 'viem';
import { Icon } from './icon';

export function PortfolioReport({ value }: { value: unknown }) {
  const payload = value as { result?: unknown } | null;
  const parsed = resultSchema.safeParse(payload?.result);
  if (!parsed.success)
    return (
      <p role="alert">
        This report could not be displayed. Try loading it again.
      </p>
    );
  const report = parsed.data;

  return (
    <section className="panel">
      <h2>
        <Icon name="report" /> Your portfolio analysis
      </h2>
      <p>Based on the holdings and prices you supplied.</p>
      <dl className="facts">
        <dt>Total value</dt>
        <dd>${formatUnits(BigInt(report.totalValueMicrousd), 6)}</dd>
        <dt>Largest holding</dt>
        <dd>{report.concentrationBps / 100}% of your portfolio</dd>
      </dl>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Asset</th>
              <th>Value (USD)</th>
              <th>Portfolio share</th>
            </tr>
          </thead>
          <tbody>
            {report.positions.map((p) => (
              <tr key={p.assetId}>
                <td>{p.assetId}</td>
                <td>${formatUnits(BigInt(p.valueMicrousd), 6)}</td>
                <td>{p.weightBps / 100}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>Technical report data</summary>
        <pre>{JSON.stringify(value, null, 2)}</pre>
      </details>
    </section>
  );
}
