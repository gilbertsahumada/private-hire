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
    page.getByRole('alert').filter({ hasText: 'No wallet detected' }),
  ).toContainText('No wallet detected');
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

for (const scenario of [
  {
    method: 'eth_requestAccounts',
    code: 4001,
    message: 'Wallet connection canceled',
  },
  {
    method: 'wallet_switchEthereumChain',
    code: 4001,
    message: 'Network change canceled',
  },
  { method: 'personal_sign', code: 4001, message: 'Sign-in canceled' },
  {
    method: 'eth_requestAccounts',
    code: -32002,
    message: 'A request is already open',
  },
]) {
  test(`explains ${scenario.method} failure ${scenario.code} and allows retry`, async ({
    page,
  }) => {
    await page.addInitScript(({ method: rejectedMethod, code }) => {
      const provider = {
        async request({ method }: { method: string }) {
          if (method === rejectedMethod)
            throw { code, message: 'User rejected or pending request' };
          if (method === 'eth_accounts' || method === 'eth_requestAccounts')
            return ['0x2222222222222222222222222222222222222222'];
          if (method === 'eth_chainId') return '0x4cef52';
          if (method === 'wallet_switchEthereumChain') return null;
          throw new Error('Unexpected test method');
        },
        on() {},
        removeListener() {},
      };
      window.addEventListener('eip6963:requestProvider', () =>
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: {
              info: { name: 'MetaMask', uuid: 'cancellation-test' },
              provider,
            },
          }),
        ),
      );
    }, scenario);
    await page.goto('/jobs');
    await expect(page.getByLabel('Connected wallet')).toBeVisible();
    const button = page.getByRole('button', { name: 'Sign in', exact: true });
    await button.click();
    await expect(
      page.getByRole('alert').filter({ hasText: scenario.message }),
    ).toBeVisible();
    await expect(button).toBeEnabled();
    await expect(
      page.getByRole('button', { name: 'Sign out', exact: true }),
    ).toHaveCount(0);
    await button.click();
    await expect(
      page.getByRole('alert').filter({ hasText: scenario.message }),
    ).toBeVisible();
    await expect(button).toBeEnabled();
  });
}

for (const recovery of ['cancel', 'timeout']) {
  test(`recovers a silent wallet using ${recovery} and ignores its late response`, async ({
    page,
  }) => {
    await page.clock.install();
    await page.addInitScript(() => {
      const provider = {
        request({ method }: { method: string }) {
          if (method === 'eth_accounts') return Promise.resolve([]);
          if (method === 'eth_chainId') return Promise.resolve('0x4cef52');
          if (method === 'eth_requestAccounts')
            return new Promise((resolve) => {
              (window as unknown as { finishWallet: () => void }).finishWallet =
                () => resolve(['0x2222222222222222222222222222222222222222']);
            });
          throw new Error('An abandoned request must not advance');
        },
        on() {},
        removeListener() {},
      };
      window.addEventListener('eip6963:requestProvider', () =>
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: {
              info: { name: 'MetaMask', uuid: 'silent-test' },
              provider,
            },
          }),
        ),
      );
    });
    await page.goto('/jobs');
    const connect = page.getByRole('button', {
      name: 'Connect wallet',
      exact: true,
    });
    await connect.click();
    await expect(
      page.getByText('Open your wallet to approve the connection.'),
    ).toBeVisible();
    if (recovery === 'cancel')
      await page
        .getByRole('button', { name: 'Cancel connection', exact: true })
        .click();
    else await page.clock.fastForward(61000);
    await expect(
      page.locator('.wallet-control').getByRole('alert'),
    ).toContainText(
      recovery === 'cancel'
        ? 'Connection canceled'
        : 'Your wallet did not respond',
    );
    await expect(connect).toBeEnabled();
    await page.evaluate(() =>
      (window as unknown as { finishWallet: () => void }).finishWallet(),
    );
    await expect(connect).toBeEnabled();
    await expect(
      page.getByText('Confirm Arc Testnet in your wallet.'),
    ).toHaveCount(0);
    await connect.click();
    await expect(
      page.getByText('Open your wallet to approve the connection.'),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Cancel connection', exact: true })
      .click();
    await expect(connect).toBeEnabled();
  });
}
