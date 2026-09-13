'use client';

import {
  createContext,
  Fragment,
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

type ConnectionStep = 'connection' | 'network' | 'signature' | 'verification';

function walletErrorCode(error: unknown): number | undefined {
  const seen = new Set<unknown>();
  let current = error;
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const value = current as { code?: unknown; cause?: unknown };
    if (value.code === 4001 || value.code === -32002 || value.code === 4902)
      return value.code;
    current = value.cause;
  }

  return undefined;
}

function connectionError(error: unknown, step: ConnectionStep): string {
  const code = walletErrorCode(error);
  if (code === 4001) {
    if (step === 'network')
      return 'Network change canceled. Switch to Arc Testnet to continue. You can try again.';
    if (step === 'signature')
      return 'Sign-in canceled. Your wallet is connected, but you are not signed in. You can try again.';

    return 'Wallet connection canceled. You can try again when you are ready.';
  }
  if (code === -32002)
    return 'A request is already open in your wallet. Open the extension to approve or cancel it.';
  if (code === 4902)
    return 'Arc Testnet is not available in your wallet. Add the network, then try again.';

  return 'Connection or sign-in could not be completed. Check your wallet and connection, then try again.';
}

function waitForWallet<T>(
  request: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    request
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

type Transaction = { from: string; to: string; data: string; chainId: number };

type WalletState = {
  account: string | null;
  connectedAccount: string | null;
  chainId: number | null;
  busy: boolean;
  progress: string;
  error: string;
  wallets: WalletInfo[];
  connect: () => Promise<void>;
  cancelConnection: () => void;
  logout: () => Promise<void>;
  send: (tx: Transaction) => Promise<Hex>;
};

const Context = createContext<WalletState>({
  account: null,
  connectedAccount: null,
  chainId: null,
  busy: false,
  progress: '',
  error: '',
  wallets: [],
  connect: async () => {},
  cancelConnection: () => {},
  logout: async () => {},
  send: async () => {
    throw new Error('Connect wallet');
  },
});

export const useWallet = () => useContext(Context);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<string | null>(null);
  const [connectedAccount, setConnectedAccount] = useState<string | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [wallets, setWallets] = useState<WalletInfo[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const connecting = useRef(false);
  const connectionAttempt = useRef<AbortController | null>(null);
  const epoch = useRef(0);
  const connection = useRef<{ address: string | null; chain: number | null }>({
    address: null,
    chain: null,
  });
  const active = useRef<WalletInfo | null>(null);
  const signedOut = useRef(false);
  const authQueue = useRef<Promise<unknown>>(Promise.resolve());
  const selected =
    wallets.find((w) => w.uuid === selectedId) ??
    wallets.find((w) => w.name === 'MetaMask') ??
    wallets[0];

  const enqueueAuth = useCallback(<T,>(work: () => Promise<T>) => {
    const operation = authQueue.current.catch(() => {}).then(work);
    authQueue.current = operation.catch(() => {});

    return operation;
  }, []);

  const invalidate = useCallback(() => {
    epoch.current++;
    setAccount(null);
    setBusy(false);

    return enqueueAuth(() => api('/api/auth/logout', {})).catch(() => {
      setError(
        'Session could not be cleared. Retry signing in before continuing.',
      );
    });
  }, [enqueueAuth]);

  const logout = useCallback(async () => {
    signedOut.current = true;
    localStorage.setItem('market-signed-out', 'true');
    connection.current = { address: null, chain: null };
    setConnectedAccount(null);
    setChainId(null);
    setError('');
    await invalidate();
  }, [invalidate]);

  useEffect(() => {
    signedOut.current = localStorage.getItem('market-signed-out') === 'true';
    setSelectedId(localStorage.getItem('market-wallet') ?? '');

    const listener = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          info: { name: string; uuid: string };
          provider: Injected;
        }>
      ).detail;
      if (!detail?.info?.uuid || !detail.provider?.request) return;
      setWallets((current) =>
        current.some(
          (w) => w.uuid === detail.info.uuid || w.provider === detail.provider,
        )
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
    if (!selected) return;
    if (active.current && active.current.provider !== selected.provider)
      void invalidate();
    active.current = selected;
    const currentEpoch = ++epoch.current;
    let disposed = false;
    let scan = 0;
    setAccount(null);
    setConnectedAccount(null);
    setChainId(null);
    connection.current = { address: null, chain: null };
    const client = createWalletClient({
      chain: arcTestnet,
      transport: custom(selected.provider),
    });

    const refresh = async (restore = false) => {
      const id = ++scan;
      try {
        const [addresses, network] = await Promise.all([
          client.getAddresses(),
          client.getChainId(),
        ]);
        if (disposed || id !== scan || signedOut.current) return;
        const address = addresses[0]?.toLowerCase() ?? null;
        const previous = connection.current;
        if (
          previous.address !== null &&
          (address !== previous.address || network !== previous.chain)
        )
          void invalidate();
        connection.current = { address, chain: network };
        setConnectedAccount(address);
        setChainId(network);
        if (!restore || !address || network !== arcTestnet.id) return;
        await authQueue.current;
        const session = await api<{ wallet: string }>('/api/auth/session');
        if (
          !disposed &&
          id === scan &&
          currentEpoch === epoch.current &&
          session.wallet === address
        )
          setAccount(address);
      } catch {
        /* A locked or unavailable provider must never restore a private session. */
      }
    };

    const accountsChanged = (value: unknown) => {
      scan++;
      const address =
        Array.isArray(value) && typeof value[0] === 'string'
          ? value[0].toLowerCase()
          : null;
      if (address === connection.current.address) return;
      signedOut.current = false;
      localStorage.removeItem('market-signed-out');
      connection.current = { ...connection.current, address };
      setConnectedAccount(address);
      setError('');
      void invalidate();
    };

    const chainChanged = (value: unknown) => {
      const network = typeof value === 'string' ? Number(value) : null;
      if (network === connection.current.chain) return;
      scan++;
      connection.current = { ...connection.current, chain: network };
      setChainId(network);
      setError('');
      void invalidate();
    };

    const disconnected = () => {
      scan++;
      connection.current = { address: null, chain: null };
      setConnectedAccount(null);
      setChainId(null);
      void invalidate();
    };

    const connected = () => {
      signedOut.current = false;
      localStorage.removeItem('market-signed-out');
      void refresh();
    };

    const resumed = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    selected.provider.on('accountsChanged', accountsChanged);
    selected.provider.on('chainChanged', chainChanged);
    selected.provider.on('disconnect', disconnected);
    selected.provider.on('connect', connected);
    window.addEventListener('focus', resumed);
    document.addEventListener('visibilitychange', resumed);
    void refresh(true);

    return () => {
      disposed = true;
      epoch.current++;
      selected.provider.removeListener('accountsChanged', accountsChanged);
      selected.provider.removeListener('chainChanged', chainChanged);
      selected.provider.removeListener('disconnect', disconnected);
      selected.provider.removeListener('connect', connected);
      window.removeEventListener('focus', resumed);
      document.removeEventListener('visibilitychange', resumed);
    };
  }, [selected, invalidate]);

  function cancelConnection() {
    epoch.current++;
    connectionAttempt.current?.abort(
      new Error(
        'Connection canceled. You can try again. Close any pending request in your wallet first.',
      ),
    );
  }

  async function connect() {
    if (connecting.current) return;
    const target = active.current;
    if (!target) {
      setError(
        'No wallet detected. Install or enable your wallet extension, then refresh this page.',
      );
      return;
    }
    connecting.current = true;
    const attempt = new AbortController();
    connectionAttempt.current = attempt;
    const timeout = window.setTimeout(() => {
      epoch.current++;
      attempt.abort(
        new Error(
          'Your wallet did not respond. If you closed or canceled its request, you can try again. Check the extension for any pending request first.',
        ),
      );
    }, 60000);
    const wait = <T,>(request: Promise<T>) =>
      waitForWallet(request, attempt.signal);
    let step: ConnectionStep = 'connection';
    setProgress('Open your wallet to approve the connection.');
    setBusy(true);
    setError('');
    let loginEpoch = epoch.current;
    try {
      signedOut.current = false;
      localStorage.removeItem('market-signed-out');
      localStorage.setItem('market-wallet', target.uuid);
      const client = createWalletClient({
        chain: arcTestnet,
        transport: custom(target.provider, { retryCount: 0 }),
      });
      await wait(client.requestAddresses());
      if (active.current !== target) throw new Error('Wallet changed');
      step = 'network';
      setProgress('Confirm Arc Testnet in your wallet.');
      await wait(client.switchChain({ id: arcTestnet.id }));
      const [address] = await wait(client.getAddresses());
      if (!address || active.current !== target)
        throw new Error('Wallet changed');
      connection.current = {
        address: address.toLowerCase(),
        chain: arcTestnet.id,
      };
      setConnectedAccount(address.toLowerCase());
      setChainId(arcTestnet.id);
      loginEpoch = epoch.current;
      setBusy(true);
      const challenge = await wait(
        api<{ nonce: string; message: string }>('/api/auth/nonce', {
          wallet: address,
        }),
      );
      if (loginEpoch !== epoch.current) return;
      step = 'signature';
      setProgress(
        'Sign the message in your wallet to sign in. This does not send a transaction.',
      );
      const signature = await wait(
        client.signMessage({
          account: address,
          message: challenge.message,
        }),
      );
      if (loginEpoch !== epoch.current) return;
      step = 'verification';
      setProgress('Verifying your sign-in…');
      await wait(
        enqueueAuth(async () => {
          if (loginEpoch !== epoch.current) return;
          const verified = await api<{ wallet: string }>('/api/auth/verify', {
            nonce: challenge.nonce,
            signature,
          });
          if (loginEpoch !== epoch.current) {
            await api('/api/auth/logout', {});

            return;
          }
          if (verified.wallet !== address.toLowerCase())
            throw new Error('Session mismatch');
          setAccount(verified.wallet);
        }),
      );
    } catch (error) {
      if (attempt.signal.aborted) {
        setAccount(null);
        setError(attempt.signal.reason.message);
      } else if (
        active.current === target &&
        (loginEpoch === epoch.current ||
          step === 'connection' ||
          step === 'network')
      ) {
        setAccount(null);
        setError(connectionError(error, step));
      }
    } finally {
      window.clearTimeout(timeout);
      connectionAttempt.current = null;
      connecting.current = false;
      setBusy(false);
      setProgress('');
    }
  }

  async function send(tx: Transaction) {
    const target = active.current;
    const version = epoch.current;
    if (
      !target ||
      !account ||
      tx.from.toLowerCase() !== account ||
      tx.chainId !== arcTestnet.id
    )
      throw new Error('Sign in with the wallet assigned to this action.');
    const client = createWalletClient({
      chain: arcTestnet,
      transport: custom(target.provider, { retryCount: 0 }),
    });
    const [addresses, network] = await Promise.all([
      client.getAddresses(),
      client.getChainId(),
    ]);
    if (
      version !== epoch.current ||
      addresses[0]?.toLowerCase() !== account ||
      network !== arcTestnet.id
    ) {
      await invalidate();
      throw new Error('Wallet or network changed. Sign in again.');
    }

    return client.sendTransaction({
      account: addresses[0] as Address,
      to: tx.to as Address,
      data: tx.data as Hex,
      value: 0n,
      chain: arcTestnet,
    });
  }

  return (
    <Context.Provider
      value={{
        account,
        connectedAccount,
        chainId,
        busy,
        progress,
        error,
        wallets,
        connect,
        cancelConnection,
        logout,
        send,
      }}
    >
      <Fragment key={account ?? 'signed-out'}>{children}</Fragment>
    </Context.Provider>
  );
}

export function WalletControl() {
  const w = useWallet();

  return (
    <div className="wallet-control">
      {w.connectedAccount && (
        <span role="status" aria-label="Connected wallet">
          {w.connectedAccount.slice(0, 6)}…{w.connectedAccount.slice(-4)}
          {w.chainId !== arcTestnet.id
            ? ' · Switch to Arc Testnet'
            : w.account
              ? ' · Signed in'
              : ' · Sign-in required'}
        </span>
      )}
      {!w.account && (
        <button disabled={w.busy} onClick={() => void w.connect()}>
          {w.busy
            ? 'Connecting…'
            : w.connectedAccount
              ? 'Sign in'
              : 'Connect wallet'}
        </button>
      )}
      {w.connectedAccount && (
        <button className="secondary" onClick={() => void w.logout()}>
          {w.account ? 'Sign out' : 'Disconnect'}
        </button>
      )}
      {w.busy && (
        <button className="secondary" onClick={w.cancelConnection}>
          Cancel connection
        </button>
      )}
      {w.busy && w.progress && <p role="status">{w.progress}</p>}
      {w.error && <p role="alert">{w.error}</p>}
    </div>
  );
}
