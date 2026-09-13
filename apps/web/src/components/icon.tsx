import type { ReactNode } from 'react';

const shapes: Record<string, ReactNode> = {
  chart: (
    <>
      <path d="M4 4v16h16" />
      <path d="M8 15v-4m5 4V7m5 8v-6" />
    </>
  ),
  report: (
    <>
      <path d="M14 3H6v18h12V7zM14 3v5h4M9 12h6m-6 4h6" />
    </>
  ),
  agent: (
    <>
      <rect x="4" y="7" width="16" height="13" rx="4" />
      <path d="M12 3v4M8 12h.01M16 12h.01M9 16h6" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="14" rx="2" />
      <path d="M8 7V3h8v4M3 12h18M10 12v3h4v-3" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 018 0v3M12 14v3" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  pie: (
    <>
      <path d="M12 3v9h9A9 9 0 0012 3Z" />
      <path d="M8 4a9 9 0 1012 12" />
    </>
  ),
  wallet: (
    <>
      <path d="M20 8V5H4a2 2 0 000 4h17v11H4a2 2 0 01-2-2V7" />
      <path d="M21 12h-6v4h6" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  trash: (
    <>
      <path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  external: (
    <>
      <path d="M14 3h7v7m0-7L10 14M10 3H3v18h18v-7" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M5 7a8 8 0 0113-2l2 3M4 16l2 3a8 8 0 0013-2" />
    </>
  ),
};

export function Icon({
  name,
  className = '',
}: {
  name: keyof typeof shapes;
  className?: string;
}) {
  return (
    <svg
      className={`icon ${className}`}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shapes[name]}
    </svg>
  );
}
