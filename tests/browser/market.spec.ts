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
    page.getByRole('heading', {
      name: 'Understand your portfolio.',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('img', { name: 'Portfolio Calculator avatar' }),
  ).toBeVisible();
  await expect(page.getByText('Checking registry…')).toHaveCount(0, {
    timeout: 30000,
  });
  const state = await (await catalogResponse).json();
  await page
    .getByText('About the agent and the technology', { exact: true })
    .click();
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
      page.getByRole('link', { name: 'Analyze a portfolio', exact: true }),
    ).toBeVisible();
  else
    await expect(
      page.getByRole('button', { name: 'Analysis unavailable' }),
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
      page.getByRole('button', { name: 'Check availability' }),
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
    .getByRole('link', { name: 'My requests', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Connect your wallet' }),
  ).toBeVisible();
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'For providers', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Provider workspace' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Connect your wallet' }),
  ).toBeVisible();
});

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

test('connects through the standard modal, restores SIWE and clears private data on account changes', async ({
  page,
}, info) => {
  await installWallet(page);
  await page.goto('/jobs');
  await openWallet(page);
  await page.getByRole('button', { name: 'Sign message', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your first analysis starts here' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Your first analysis starts here' }),
  ).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as {
        walletEvent: (event: string, value: unknown) => void;
      }
    ).walletEvent('accountsChanged', [
      '0x2222222222222222222222222222222222222222',
    ]),
  );
  await expect(
    page.getByRole('heading', { name: 'Connect your wallet' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Cancel connection' }),
  ).toHaveCount(0);
  await page.screenshot({
    path: `.local/rainbowkit-${info.project.name}.png`,
    fullPage: true,
  });
});

test('uses a dismissible connection modal when the extension never responds', async ({
  page,
}, info) => {
  await installWallet(page, 'silent');
  await page.goto('/agents');
  await openWallet(page);
  await page.screenshot({
    path: `.local/rainbowkit-pending-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Connect wallet', exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole('button', { name: 'Cancel connection' }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Connect wallet', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('shows rejected requests inside the standard connection flow', async ({
  page,
}) => {
  await installWallet(page, 'reject');
  await page.goto('/agents');
  await openWallet(page);
  await expect(
    page.getByRole('alert').filter({ hasText: 'Request canceled' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Connect wallet', exact: true }),
  ).toBeEnabled();
});

for (const event of ['chainChanged', 'disconnect']) {
  test(`clears authenticated pages on ${event}`, async ({ page }) => {
    await installWallet(page);
    await page.goto('/jobs');
    await openWallet(page);
    await page
      .getByRole('button', { name: 'Sign message', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Your first analysis starts here' }),
    ).toBeVisible();
    await page.evaluate(
      (event) =>
        (
          window as unknown as {
            walletEvent: (event: string, value: unknown) => void;
          }
        ).walletEvent(event, event === 'chainChanged' ? '0x1' : { code: 4900 }),
      event,
    );
    await expect(
      page.getByRole('heading', { name: 'Connect your wallet' }),
    ).toBeVisible();
    await expect
      .poll(async () => (await page.request.get('/api/auth/session')).status())
      .toBe(401);
  });
}

test('does not restore a late verified session after switching accounts', async ({
  page,
}) => {
  await installWallet(page);
  let release!: () => void;
  let ready!: () => void;
  const responseReady = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const resume = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/auth/verify', async (route) => {
    const response = await route.fetch();
    ready();
    await resume;
    await route.fulfill({ response });
  });
  await page.goto('/jobs');
  await openWallet(page);
  await page.getByRole('button', { name: 'Sign message', exact: true }).click();
  await responseReady;
  await page.evaluate(() =>
    (
      window as unknown as {
        walletEvent: (event: string, value: unknown) => void;
      }
    ).walletEvent('accountsChanged', [
      '0x2222222222222222222222222222222222222222',
    ]),
  );
  const cleared = page.waitForResponse(
    (r) => r.url().endsWith('/api/auth/logout') && r.status() === 200,
  );
  release();
  await cleared;
  await expect(
    page.getByRole('heading', { name: 'Connect your wallet' }),
  ).toBeVisible();
  await expect
    .poll(async () => (await page.request.get('/api/auth/session')).status())
    .toBe(401);
  await expect(
    page.getByRole('heading', { name: 'Your first analysis starts here' }),
  ).toHaveCount(0);
});

test('waits for initial session status before opening the wallet dialog', async ({
  page,
}) => {
  await installWallet(page, 'silent');
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/auth/session', async (route) => {
    await pending;
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: '{"error":"SIGN_IN_REQUIRED"}',
    });
  });
  await page.goto('/jobs');
  await expect(
    page.getByRole('button', { name: 'Connect wallet', exact: true }),
  ).toBeDisabled();
  release();
  await openWallet(page);
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Connect wallet', exact: true }),
  ).toBeEnabled();
});

test('lets a customer enter ordinary quantities and prices without a payment', async ({
  page,
}, info) => {
  await installWallet(page);
  await page.goto('/jobs/new');
  await openWallet(page);
  await page.getByRole('button', { name: 'Sign message', exact: true }).click();
  await expect(
    page.getByLabel('Asset 1 quantity', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Asset 1 quantity', { exact: true }).fill('2.5');
  await page.getByLabel('Asset 1 price in USD', { exact: true }).fill('10');
  await expect(page.getByText('Atomic quantity', { exact: true })).toHaveCount(
    0,
  );
  await page.screenshot({
    path: `.local/analysis-form-${info.project.name}.png`,
    fullPage: true,
  });
  let body: Record<string, any> | undefined;
  await page.route('**/api/jobs', async (route) => {
    body = route.request().postDataJSON();
    // Inspect the submitted form without creating a real request or initiating payment.
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"TEST_ONLY"}',
    });
  });
  await page
    .getByRole('button', { name: 'Review my analysis', exact: true })
    .click();
  await expect.poll(() => body).toBeTruthy();
  expect(body?.input.positions[0]).toMatchObject({
    quantityAtomic: '25',
    quantityDecimals: 1,
    unitPriceMicrousd: '10000000',
  });
  expect(body?.policy).toMatchObject({
    valueToleranceMicrousd: '0',
    weightToleranceBps: 0,
  });
  expect(body?.durationMinutes).toBe(1440);
});

test('presents a report in dollars and percentages with technical data secondary', async ({
  page,
}) => {
  const account = await installWallet(page);
  // Browser-only presentation fixture, not a real funded request or acceptance receipt.
  await page.route('**/api/jobs/copy-preview', (route) =>
    route.fulfill({
      json: {
        request_id: 'copy-preview',
        job_id: '42',
        buyer: account.address.toLowerCase(),
        provider: '0x2222222222222222222222222222222222222222',
        budget: '10000',
        onchainBudget: '10000',
        expired_at: 4102444800,
        chain_status: 3,
        manifest_hash: '0x' + '11'.repeat(32),
        pending_tx: null,
        refundAvailable: false,
        task: { state: 'ready', result_hash: '0x' + '22'.repeat(32) },
        events: [],
        input: {},
        reports: [],
        attempts: [],
      },
    }),
  );
  await page.route('**/api/jobs/copy-preview/result', (route) =>
    route.fulfill({
      json: {
        result: {
          schemaVersion: 'portfolio-result/v1',
          requestId: 'copy-preview',
          totalValueMicrousd: '25000000',
          positions: [
            { assetId: 'sample', valueMicrousd: '25000000', weightBps: 10000 },
          ],
          concentrationBps: 10000,
          executionMode: 'deterministic',
        },
      },
    }),
  );
  await page.goto('/jobs/copy-preview');
  await openWallet(page);
  await page.getByRole('button', { name: 'Sign message', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Analysis #42' }),
  ).toBeVisible();
  await expect(
    page.getByText('Your report was accepted and the provider was paid.'),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'View portfolio report', exact: true })
    .click();
  await expect(
    page.getByRole('cell', { name: '$25', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('cell', { name: '100%', exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('pre').filter({ hasText: 'portfolio-result/v1' }),
  ).not.toBeVisible();
});
