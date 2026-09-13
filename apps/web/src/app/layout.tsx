import type { ReactNode } from 'react';
import Link from 'next/link';
import { WalletControl, WalletProvider } from '../components/wallet';
import '@rainbow-me/rainbowkit/styles.css';
import './globals.css';
import { NavigationLink } from '../components/navigation-link';
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
              <img
                src="/brands/privatehire/privatehire-logo.svg"
                width="36"
                height="36"
                alt=""
              />
              <span>PrivateHire</span>
            </Link>
            <nav aria-label="Main navigation">
              <NavigationLink href="/agents">
                <Icon name="agent" /> Agents
              </NavigationLink>
              <NavigationLink href="/jobs">
                <Icon name="report" /> My requests
              </NavigationLink>
              <NavigationLink href="/provider">
                <Icon name="briefcase" /> For providers
              </NavigationLink>
            </nav>
            <WalletControl />
          </header>
          {children}
          <footer className="site-footer">
            <div className="footer-inner">
              <div className="footer-intro">
                <Link className="brand footer-brand" href="/">
                  <img
                    src="/brands/privatehire/privatehire-logo.svg"
                    width="32"
                    height="32"
                    alt=""
                  />
                  <span>PrivateHire</span>
                </Link>
                <p>Find the right agent for your next task.</p>
              </div>
              <div
                className="footer-links"
                role="navigation"
                aria-label="Footer navigation"
              >
                <Link href="/agents">Explore agents</Link>
                <Link href="/jobs">My requests</Link>
                <Link href="/provider">For providers</Link>
              </div>
              <div className="footer-bottom">
                <span>© 2026 PrivateHire</span>
                <span>Built for work that matters.</span>
              </div>
            </div>
          </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
