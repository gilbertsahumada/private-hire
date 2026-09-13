import { test, expect } from '@playwright/test';
import {
  generatePrivateKey,
  privateKeyToAccount,
} from '../../apps/web/node_modules/viem/_esm/accounts/index.js';
import {
  hexToString,
  type Hex,
} from '../../apps/web/node_modules/viem/_esm/index.js';

type WalletMode = 'success' | 'reject' | 'silent';

async function installWallet(
  page: import('@playwright/test').Page,
  mode: WalletMode = 'success',
) {
  const account = privateKeyToAccount(generatePrivateKey());
  await page.exposeFunction('testSignMessage', (hex: string) =>
    account.signMessage({ message: hexToString(hex as Hex) }),
  );
  await page.addInitScript(
    ({ address, mode }) => {
      let currentAddress = address;
      let chain = '0x4cef52';
      const listeners: Record<string, ((value: unknown) => void)[]> = {};
      const state = window as unknown as {
        walletEvent: (name: string, value: unknown) => void;
        finishWallet: () => void;
        testSignMessage: (hex: string) => Promise<string>;
      };
      state.walletEvent = (name, value) => {
        if (name === 'accountsChanged')
          currentAddress = (value as string[])[0] ?? '';
        if (name === 'chainChanged') chain = String(value);
        if (name === 'disconnect') currentAddress = '';
        for (const listener of listeners[name] ?? []) listener(value);
      };
      const provider = {
        async request({
          method,
          params,
        }: {
          method: string;
          params?: unknown[];
        }) {
          if (method === 'eth_accounts')
            return localStorage.getItem('test-authorized') && currentAddress
              ? [currentAddress]
              : [];
          if (method === 'eth_chainId') return chain;
          if (
            method === 'eth_requestAccounts' ||
            method === 'wallet_requestPermissions'
          ) {
            if (mode === 'reject')
              throw { code: 4001, message: 'User rejected request' };
            if (mode === 'silent')
              return new Promise((resolve) => {
                state.finishWallet = () => resolve([currentAddress]);
              });
            localStorage.setItem('test-authorized', 'true');
            return method === 'wallet_requestPermissions'
              ? [
                  {
                    parentCapability: 'eth_accounts',
                    caveats: [
                      {
                        type: 'restrictReturnedAccounts',
                        value: [currentAddress],
                      },
                    ],
                  },
                ]
              : [currentAddress];
          }
          if (method === 'wallet_requestPermissions')
            return [
              {
                parentCapability: 'eth_accounts',
                caveats: [
                  { type: 'restrictReturnedAccounts', value: [currentAddress] },
                ],
              },
            ];
          if (method === 'wallet_revokePermissions') return null;
          if (method === 'wallet_switchEthereumChain') {
            chain = '0x4cef52';
            state.walletEvent('chainChanged', chain);
            return null;
          }
          if (method === 'personal_sign')
            return state.testSignMessage(String(params?.[0]));
          throw new Error(`Unsupported test wallet method: ${method}`);
        },
        on(name: string, listener: (value: unknown) => void) {
          (listeners[name] ??= []).push(listener);
        },
        removeListener(name: string, listener: (value: unknown) => void) {
          listeners[name] = (listeners[name] ?? []).filter(
            (v) => v !== listener,
          );
        },
      };
      window.addEventListener('eip6963:requestProvider', () =>
        window.dispatchEvent(
          new CustomEvent('eip6963:announceProvider', {
            detail: {
              info: {
                name: 'MetaMask',
                uuid: '350670db-19fa-4704-a166-e52e178b59d2',
                rdns: 'io.metamask',
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="orange"/></svg>',
              },
              provider,
            },
          }),
        ),
      );
    },
    { address: account.address, mode },
  );
  return account;
}

async function openWallet(page: import('@playwright/test').Page) {
  await page
    .getByRole('button', { name: 'Connect wallet', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'MetaMask', exact: true })
    .click({ timeout: 10000 })
    .catch(async (error) => {
      // A connection can finish while the modal replaces its wallet list with SIWE.
      if (
        !(await page
          .getByRole('button', { name: 'Sign message', exact: true })
          .isVisible())
      )
        throw error;
    });
}

const catalog = {
  agents: [
    {
      name: 'Portfolio Calculator',
      agentId: '894552',
      description:
        'Calculate portfolio values and weights from your supplied holdings.',
      image: '/agent/portfolio-calculator.svg',
      wallet: '0x1111111111111111111111111111111111111111',
      walletExplorerUrl: 'https://testnet.arcscan.app',
      price: '10000',
      stale: false,
      identityVerified: true,
      enabled: true,
      availabilityReason: '',
      trustUrl: 'https://trust8004.xyz',
    },
  ],
};

test('keeps a skeleton until session resolution instead of flashing signed-out content', async ({
  page,
}, info) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/auth/session', async (route) => {
    await gate;
    await route.fulfill({ status: 401, json: { error: 'UNAUTHENTICATED' } });
  });
  await page.goto('/jobs');
  await expect(
    page.getByRole('status', { name: 'Connecting your workspace…' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Connect your wallet' }),
  ).toHaveCount(0);
  await expect(page.getByText('Your first analysis starts here')).toHaveCount(
    0,
  );
  await page.screenshot({
    path: `.local/workspace-loading-${info.project.name}.png`,
    fullPage: true,
  });
  release();
  await expect(
    page.getByRole('heading', { name: 'Connect your wallet' }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test('availability retry has feedback and does not flash a made-up price', async ({
  page,
}) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 401, json: {} }),
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  let retry = false;
  await page.route('**/api/agents', async (route) => {
    calls++;
    if (!retry)
      return route.fulfill({ status: 503, json: { error: 'OFFLINE' } });
    await gate;
    await route.fulfill({ json: catalog });
  });
  await page.goto('/agents/894552');
  await expect(
    page.getByRole('button', { name: 'Retry', exact: true }),
  ).toBeVisible();
  retry = true;
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Checking availability…' }),
  ).toBeDisabled();
  await expect(page.locator('.price-skeleton')).toBeVisible();
  release();
  await expect(
    page.getByRole('link', { name: 'Analyze a portfolio', exact: true }),
  ).toBeVisible();
  const beforeNavigation = calls;
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'My requests' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'My analyses', exact: true }),
  ).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Agents', exact: true })
    .click();
  await expect(
    page.getByRole('link', { name: 'View Portfolio Calculator', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Portfolio Calculator', exact: true }),
  ).toBeVisible();
  expect(calls).toBe(beforeNavigation);
});

test('keeps loaded detail mounted during refresh and clears it on account change', async ({
  page,
}) => {
  const account = await installWallet(page);
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: { wallet: account.address.toLowerCase() } }),
  );
  await page.route('**/api/auth/logout', (route) =>
    route.fulfill({ json: { ok: true } }),
  );
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  let blockRefresh = false;
  await page.route('**/api/jobs/loading-preview', async (route) => {
    calls++;
    if (blockRefresh) {
      await gate;
      return route.fulfill({ status: 503, json: { error: 'TEMPORARY' } });
    }
    return route.fulfill({
      json: {
        request_id: 'loading-preview',
        job_id: '42',
        buyer: account.address.toLowerCase(),
        provider: '0x2222222222222222222222222222222222222222',
        budget: '10000',
        onchainBudget: '10000',
        expired_at: 4102444800,
        chain_status: 1,
        manifest_hash: 'private-preview',
        pending_tx: null,
        refundAvailable: false,
        task: null,
        events: [],
        input: {},
        reports: [],
        attempts: [],
      },
    });
  });
  await page.goto('/jobs/loading-preview');
  await openWallet(page);
  await expect(
    page.getByRole('heading', { name: 'Analysis #42' }),
  ).toBeVisible();
  await page.getByText('Contract and request details', { exact: true }).click();
  blockRefresh = true;
  await page
    .getByRole('button', { name: 'Check transaction', exact: true })
    .click();
  await expect(
    page.getByText('Checking your transaction…', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('Request fingerprint: private-preview'),
  ).toBeVisible();
  await expect(
    page.getByRole('status', { name: 'Loading your analysis…' }),
  ).toHaveCount(0);
  release();
  await expect(
    page.getByText('Couldn’t refresh. Showing the last loaded details.', {
      exact: false,
    }),
  ).toBeVisible();
  await expect(
    page.getByText('Request fingerprint: private-preview'),
  ).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as {
        walletEvent: (name: string, value: unknown) => void;
      }
    ).walletEvent('accountsChanged', [
      '0x2222222222222222222222222222222222222222',
    ]),
  );
  await expect(page.getByRole('heading', { name: 'Analysis #42' })).toHaveCount(
    0,
  );
  await expect(
    page.getByText('Request fingerprint: private-preview'),
  ).toHaveCount(0);
});

test('respects reduced motion in loading states', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/auth/session', () => new Promise(() => {}));
  await page.goto('/jobs');
  await expect(page.locator('.skeleton').first()).toBeVisible();
  expect(
    await page
      .locator('.skeleton')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
  expect(
    await page
      .locator('.spinner')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe('none');
});

test('catalog lays out one or several API agents with separate profile links', async ({
  page,
}, info) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 401, json: {} }),
  );
  let agents = catalog.agents;
  await page.route('**/api/agents', (route) =>
    route.fulfill({ json: { agents } }),
  );
  await page.goto('/agents');
  await expect(
    page.getByRole('heading', { name: 'Find your next agent.' }),
  ).toBeVisible();
  await expect(page.locator('.agent-card')).toHaveCount(1);
  await expect(
    page.getByRole('link', { name: 'View Portfolio Calculator' }),
  ).toHaveAttribute('href', '/agents/894552');
  await page.screenshot({
    path: `.local/agent-catalog-${info.project.name}.png`,
    fullPage: true,
  });
  agents = [
    ...agents,
    {
      ...agents[0],
      agentId: 'test-second',
      name: 'Test research agent',
      enabled: false,
    },
  ];
  await page.reload();
  await expect(page.locator('.agent-card')).toHaveCount(2);
  await expect(
    page.getByRole('link', { name: 'View Test research agent' }),
  ).toHaveAttribute('href', '/agents/test-second');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.getByRole('link', { name: 'View Test research agent' }).click();
  await expect(
    page.getByRole('heading', { name: 'Test research agent', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Analyze a portfolio', exact: true }),
  ).toHaveCount(0);
});

test('agent profile explains the service without technical disclosures', async ({
  page,
}, info) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 401, json: {} }),
  );
  await page.route('**/api/agents', (route) =>
    route.fulfill({ json: catalog }),
  );
  await page.goto('/agents/894552');
  await expect(
    page.getByRole('link', { name: 'Analyze a portfolio', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'What you’ll need' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Three steps to your report' }),
  ).toBeVisible();
  await expect(page.locator('main details')).toHaveCount(0);
  await expect(
    page.getByText('Demo payment with test USDC on Arc Testnet.'),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.screenshot({
    path: `.local/simple-agent-${info.project.name}.png`,
    fullPage: true,
  });
});

test('recovers a temporary job read failure after a full page reload', async ({
  page,
}) => {
  const account = await installWallet(page);
  await page.addInitScript(() =>
    localStorage.setItem('test-authorized', 'true'),
  );
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: { wallet: account.address.toLowerCase() } }),
  );
  let failures = 0;
  await page.route('**/api/jobs/reload-preview', (route) => {
    if (failures > 0) {
      failures--;
      return route.fulfill({ status: 503, body: 'Temporarily unavailable' });
    }
    return route.fulfill({
      json: {
        request_id: 'reload-preview',
        job_id: '42',
        buyer: account.address.toLowerCase(),
        provider: '0x2222222222222222222222222222222222222222',
        budget: '10000',
        onchainBudget: '10000',
        expired_at: 4102444800,
        chain_status: 1,
        manifest_hash: 'preview',
        pending_tx: null,
        refundAvailable: false,
        task: null,
        events: [],
        input: {},
        reports: [],
        attempts: [],
      },
    });
  });
  await page.goto('/jobs/reload-preview');
  await expect(
    page.getByRole('heading', { name: 'Analysis #42' }),
  ).toBeVisible();
  failures = 2;
  await page.reload();
  await expect(
    page.getByRole('status', { name: 'Reconnecting to your analysis…' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry loading' })).toHaveCount(
    0,
  );
  await expect(page.getByRole('heading', { name: 'Analysis #42' })).toBeVisible(
    { timeout: 10000 },
  );
});
