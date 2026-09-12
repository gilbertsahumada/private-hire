import type { ReactNode } from 'react';
import Link from 'next/link';
import { WalletControl, WalletProvider } from '../components/wallet';
import './globals.css';

export const metadata = {
  title: 'Confidential Agent Jobs',
  description: 'Hire a deterministic portfolio agent on Arc Testnet.',
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <header>
            <Link className="brand" href="/agents">
              Confidential Agent Jobs
            </Link>
            <nav aria-label="Main navigation">
              <Link href="/agents">Agents</Link>
              <Link href="/jobs">Jobs</Link>
              <Link href="/provider">Provider</Link>
            </nav>
            <WalletControl />
          </header>
          {children}
          <footer>Arc Testnet · CRE simulation · Test USDC only</footer>
        </WalletProvider>
      </body>
    </html>
  );
}
