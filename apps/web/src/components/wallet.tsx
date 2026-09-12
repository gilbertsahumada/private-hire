'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  createWalletClient,
  custom,
  type EIP1193Provider,
  type Address,
  type Hex,
} from 'viem';
import { arcChain as arcTestnet } from '@private-hire/chain';

type Injected = EIP1193Provider;

type WalletInfo = { name: string; uuid: string; provider: Injected };

export async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? 'Request failed. Try again.');

  return result;
}

const Context = createContext<{
  account: string | null;
  busy: boolean;
  error: string;
  wallets: WalletInfo[];
  connect: (id?: string) => Promise<void>;
  logout: () => Promise<void>;
  send: (tx: {
    from: string;
    to: string;
    data: string;
    chainId: number;
  }) => Promise<Hex>;
}>({
  account: null,
  busy: false,
  error: '',
  wallets: [],
  connect: async () => {},
  logout: async () => {},
  send: async () => {
    throw new Error('Connect wallet');
  },
});

export const useWallet = () => useContext(Context);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const provider = useRef<Injected | null>(null);
  const logout = useCallback(async () => {
    localStorage.removeItem('market-wallet');
    setAccount(null);
    await api('/api/auth/logout', {});
  }, []);
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          info: { name: string; uuid: string };
          provider: Injected;
        }>
      ).detail;
      setWallets((current) =>
        current.some((w) => w.uuid === detail.info.uuid)
          ? current
          : [...current, { ...detail.info, provider: detail.provider }],
      );
    };

    window.addEventListener('eip6963:announceProvider', listener);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    const legacy = (window as unknown as { ethereum?: Injected }).ethereum;
    if (legacy)
      setWallets((current) =>
        current.length
          ? current
          : [{ name: 'Browser wallet', uuid: 'injected', provider: legacy }],
      );

    return () =>
      window.removeEventListener('eip6963:announceProvider', listener);
  }, []);
  useEffect(() => {
    const current = provider.current;

    const changed = () => {
      void logout();
    };

    current?.on?.('accountsChanged', changed);
    current?.on?.('chainChanged', changed);

    return () => {
      current?.removeListener?.('accountsChanged', changed);
      current?.removeListener?.('chainChanged', changed);
    };
  }, [account, logout]);

  useEffect(() => {
    let cancelled = false;
    if (account || !wallets.length) return;
    const selected = wallets.find(
      (w) => w.uuid === localStorage.getItem('market-wallet'),
    );
    if (!selected) return;
    const client = createWalletClient({
      chain: arcTestnet,
      transport: custom(selected.provider),
    });
    void Promise.all([
      client.getAddresses(),
      client.getChainId(),
      api<{ wallet: string }>('/api/auth/session'),
    ])
      .then(([addresses, chainId, login]) => {
        if (
          !cancelled &&
          chainId === arcTestnet.id &&
          addresses[0]?.toLowerCase() === login.wallet
        ) {
          provider.current = selected.provider;
          setAccount(login.wallet);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [wallets, account]);

  async function connect(id?: string) {
    setBusy(true);
    setError('');
    try {
      const selected = wallets.find((w) => w.uuid === id) ?? wallets[0];
      if (!selected) throw new Error('Install a browser wallet to continue.');
      provider.current = selected.provider;
      localStorage.setItem('market-wallet', selected.uuid);
      const client = createWalletClient({
        chain: arcTestnet,
        transport: custom(selected.provider),
      });
      const [address] = await client.requestAddresses();
      await client.switchChain({ id: arcTestnet.id });
      const challenge = await api<{ nonce: string; message: string }>(
        '/api/auth/nonce',
        { wallet: address },
      );
      const signature = await client.signMessage({
        account: address,
        message: challenge.message,
      });
      const verified = await api<{ wallet: string }>('/api/auth/verify', {
        nonce: challenge.nonce,
        signature,
      });
      setAccount(verified.wallet);
    } catch {
      setAccount(null);
      setError(
        'Connection or sign-in was not completed. Check your wallet and select Arc Testnet.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function send(tx: {
    from: string;
    to: string;
    data: string;
    chainId: number;
  }) {
    if (!provider.current || !account || tx.from.toLowerCase() !== account)
      throw new Error('Connect the wallet assigned to this action.');
    const client = createWalletClient({
      chain: arcTestnet,
      transport: custom(provider.current),
    });
    const [address] = await client.getAddresses();
    if (
      address?.toLowerCase() !== account ||
      (await client.getChainId()) !== tx.chainId
    ) {
      await logout();
      throw new Error('Wallet or network changed. Sign in again.');
    }

    return client.sendTransaction({
      account: address as Address,
      to: tx.to as Address,
      data: tx.data as Hex,
      value: 0n,
      chain: arcTestnet,
    });
  }

  return (
    <Context.Provider
      value={{ account, busy, error, wallets, connect, logout, send }}
    >
      {children}
    </Context.Provider>
  );
}

export function WalletControl() {
  const w = useWallet();

  return (
    <div className="wallet-control">
      {w.account ? (
        <button className="secondary" onClick={() => void w.logout()}>
          {w.account.slice(0, 6)}…{w.account.slice(-4)} · Sign out
        </button>
      ) : (
        <>
          <select aria-label="Choose wallet" id="wallet-choice">
            {w.wallets.length === 0 && <option>No browser wallet</option>}
            {w.wallets.map((wallet) => (
              <option key={wallet.uuid} value={wallet.uuid}>
                {wallet.name}
              </option>
            ))}
          </select>
          <button
            disabled={w.busy}
            onClick={() =>
              void w.connect(
                (document.getElementById('wallet-choice') as HTMLSelectElement)
                  ?.value,
              )
            }
          >
            {w.busy ? 'Connecting…' : 'Connect wallet'}
          </button>
        </>
      )}
      {w.error && <p role="alert">{w.error}</p>}
    </div>
  );
}
