import { test, expect } from '@playwright/test';
import {
  generatePrivateKey,
  privateKeyToAccount,
} from '../../apps/web/node_modules/viem/_esm/accounts/index.js';
import {
  hexToString,
  type Hex,
} from '../../apps/web/node_modules/viem/_esm/index.js';

test('shows the real agent and protected empty workspaces without overflow', async ({
  page,
}, info) => {
  const catalogResponse = page.waitForResponse(
    (r) => r.url().endsWith('/api/agents') && r.status() === 200,
  );
  await page.goto('/agents');
  await expect(
    page.getByRole('heading', { name: 'Portfolio Calculator', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Portfolio Calculator avatar' }),
  ).toBeVisible();
  await expect(page.getByText('Checking registry…')).toHaveCount(0, {
    timeout: 30000,
  });
  const state = await (await catalogResponse).json();
  await expect(
    page.getByRole('combobox', { name: 'Choose wallet' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: state.agents[0].wallet, exact: true }),
  ).toHaveAttribute(
    'href',
    `https://testnet.arcscan.app/address/${state.agents[0].wallet}`,
  );
  if (state.agents[0].enabled)
    await expect(
      page.getByRole('link', { name: 'Create a job', exact: true }),
    ).toBeVisible();
  else
    await expect(
      page.getByRole('button', { name: 'Contracting not enabled' }),
    ).toBeDisabled();
  await expect(
    page.getByText(
      state.agents[0].identityVerified
        ? 'Registry and payment wallet verified'
        : 'Verification unavailable',
      { exact: true },
    ),
  ).toBeVisible();
  if (!state.agents[0].identityVerified)
    await expect(
      page.getByRole('button', { name: 'Retry verification' }),
    ).toBeVisible();
  await page.screenshot({
    path: `.local/agents-${info.project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Jobs', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Connect your wallet' }),
  ).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Provider', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Provider workspace' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Connect your wallet' }),
  ).toBeVisible();
});

test('detects wallet immediately and updates restored login on account chain and disconnect events', async ({
  page,
}, info) => {
  const account = privateKeyToAccount(generatePrivateKey());
  await page.exposeFunction('testSignMessage', async (hex: string) =>
    account.signMessage({ message: hexToString(hex as Hex) }),
  );
  await page.addInitScript(
    ({ address }) => {
      const listeners: Record<string, ((value: unknown) => void)[]> = {};
      let currentAddress = address;
      let currentChain = '0x' + (5042002).toString(16);
      (
        window as unknown as {
          walletEvent: (event: string, value: unknown) => void;
        }
      ).walletEvent = (event, value) => {
        if (event === 'accountsChanged')
          currentAddress = (value as string[])[0] ?? '';
        if (event === 'chainChanged') currentChain = String(value);
        if (event === 'disconnect') currentAddress = '';
        for (const listener of listeners[event] ?? []) listener(value);
      };
      const provider = {
        async request({
          method,
          params,
        }: {
          method: string;
          params?: unknown[];
        }) {
          if (method === 'eth_accounts' || method === 'eth_requestAccounts')
            return currentAddress ? [currentAddress] : [];
          if (method === 'eth_chainId') return currentChain;
          if (method === 'wallet_switchEthereumChain') return null;
          if (method === 'personal_sign')
            return (
              window as unknown as {
                testSignMessage: (hex: string) => Promise<string>;
              }
            ).testSignMessage(String(params?.[0]));
          throw new Error('Unsupported test wallet method');
        },
        on(event: string, listener: (value: unknown) => void) {
          (listeners[event] ??= []).push(listener);
        },
        removeListener(event: string, listener: (value: unknown) => void) {
          listeners[event] = (listeners[event] ?? []).filter(
            (v) => v !== listener,
          );
        },
      };

      const announce = () =>
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: {
              info: { name: 'Ephemeral test wallet', uuid: 'test-wallet' },
              provider,
            },
          }),
        );

      window.addEventListener('eip6963:requestProvider', announce);
    },
    { address: account.address },
  );
  await page.goto('/jobs');
  await expect(page.getByLabel('Connected wallet')).toContainText(
    'Sign-in required',
  );
  await page
    .getByRole('button', { name: /^(Connect wallet|Sign in)$/ })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your first job starts here' }),
  ).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Your first job starts here' }),
  ).toBeVisible({ timeout: 30000 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: `.local/wallet-${info.project.name}.png`,
    fullPage: true,
  });
  const second = '0x2222222222222222222222222222222222222222';

  await page.evaluate(
    (address) =>
      (
        window as unknown as {
          walletEvent: (event: string, value: unknown) => void;
        }
      ).walletEvent('accountsChanged', [address]),
    second,
  );
  await expect(page.getByLabel('Connected wallet')).toContainText(
    '0x2222…2222',
  );
  await expect(
    page.getByRole('heading', { name: 'Connect your wallet' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as {
        walletEvent: (event: string, value: unknown) => void;
      }
    ).walletEvent('chainChanged', '0x1'),
  );
  await expect(page.getByLabel('Connected wallet')).toContainText(
    'Switch to Arc Testnet',
  );
  await page.evaluate(() =>
    (
      window as unknown as {
        walletEvent: (event: string, value: unknown) => void;
      }
    ).walletEvent('disconnect', {}),
  );
  await expect(page.getByLabel('Connected wallet')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Connect wallet', exact: true }),
  ).toBeVisible();
  // Hold a genuine SIWE response while the selected account changes.
  let release!: () => void;
  let responseReady!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    responseReady = resolve;
  });
  await page.route('**/api/auth/verify', async (route) => {
    const response = await route.fetch();
    responseReady();
    await held;
    await route.fulfill({ response });
  });
  await page.evaluate((address) => {
    const w = window as unknown as {
      walletEvent: (event: string, value: unknown) => void;
    };
    w.walletEvent('accountsChanged', [address]);
    w.walletEvent('chainChanged', '0x' + (5042002).toString(16));
  }, account.address);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await ready;
  await page.evaluate(
    (address) =>
      (
        window as unknown as {
          walletEvent: (event: string, value: unknown) => void;
        }
      ).walletEvent('accountsChanged', [address]),
    second,
  );
  const cleared = page.waitForResponse(
    (r) => r.url().endsWith('/api/auth/logout') && r.status() === 200,
  );
  release();
  await cleared;
  await expect(page.getByLabel('Connected wallet')).toContainText(
    '0x2222…2222',
  );
  await expect(
    page.getByRole('heading', { name: 'Connect your wallet' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Sign out', exact: true }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Disconnect', exact: true }).click();
  await expect(page.getByLabel('Connected wallet')).toHaveCount(0);

  await expect(
    page.getByRole('heading', { name: 'Connect your wallet' }),
  ).toBeVisible();
});

test('wallet absence is actionable and navigation works with the keyboard', async ({
  page,
}) => {
  await page.goto('/agents');
  await page
    .getByRole('button', { name: 'Connect wallet', exact: true })
    .click();
  await expect(
    page
      .getByRole('alert')
      .filter({ hasText: 'Connection or sign-in was not completed' }),
  ).toContainText('Connection or sign-in was not completed');
  const jobs = page
    .getByRole('navigation')
    .getByRole('link', { name: 'Jobs', exact: true });
  await jobs.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/jobs$/);
  await expect(
    page.getByRole('heading', { name: 'Connect your wallet' }),
  ).toBeVisible();
});
