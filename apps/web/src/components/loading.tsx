export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function LoadingState({
  label = 'Loading your workspace…',
  detail = false,
}: {
  label?: string;
  detail?: boolean;
}) {
  return (
    <div
      className={`loading-state ${detail ? 'loading-detail' : ''}`}
      role="status"
      aria-label={label}
    >
      <div className="loading-caption">
        <Spinner />
        <span>{label}</span>
      </div>
      <div className="skeleton-stack" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <div className="skeleton-card" key={i}>
            <div className="skeleton-copy">
              <span className="skeleton skeleton-title" />
              <span className="skeleton skeleton-line" />
            </div>
            <span className="skeleton skeleton-pill" />
          </div>
        ))}
      </div>
    </div>
  );
}
