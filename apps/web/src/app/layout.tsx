import type { ReactNode } from 'react';
import Link from 'next/link';
import { WalletControl, WalletProvider } from '../components/wallet';
import '@rainbow-me/rainbowkit/styles.css';
import './globals.css';
import { Icon } from '../components/icon';

export const metadata = {
  title: 'PrivateHire',
  description:
    'Find agents for tasks with private data. Explore our first portfolio analysis agent on Arc Testnet.',
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <header>
            <Link className="brand" href="/">
              PrivateHire
            </Link>
            <nav aria-label="Main navigation">
              <Link href="/agents">
                <Icon name="agent" /> Agents
              </Link>
              <Link href="/jobs">
                <Icon name="report" /> My requests
              </Link>
              <Link href="/provider">
                <Icon name="briefcase" /> For providers
              </Link>
            </nav>
            <WalletControl />
          </header>
          {children}
          <footer>
            <div className="powered-by" aria-label="Powered by">
              <p>Powered by</p>
              <div className="powered-by-logos">
                <a
                  href="https://chain.link/cre"
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    src="/brands/chainlink-white.svg"
                    alt="Chainlink"
                    className="chainlink-logo"
                  />
                  <span>CRE simulation</span>
                </a>
                <a href="https://www.arc.io/" target="_blank" rel="noreferrer">
                  <img
                    src="/brands/arc-white.svg"
                    alt="Arc"
                    className="arc-logo"
                  />
                  <span>Arc Testnet</span>
                </a>
              </div>
            </div>
            Demo on Arc Testnet · Use test USDC · Checks run with CRE simulation
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
