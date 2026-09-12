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
  await page.goto('/agents');
  await expect(
    page.getByRole('heading', { name: 'Portfolio Calculator', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Contracting not enabled' }),
  ).toBeDisabled();
  await expect(
    page.getByRole('img', { name: 'Portfolio Calculator avatar' }),
  ).toBeVisible();
  await expect(page.getByText('Checking registry…')).toHaveCount(0, {
    timeout: 30000,
  });
  await expect(
    page.getByText('Registry and payment wallet verified'),
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

test('signs a real login with an ephemeral test wallet and restores the session', async ({
  page,
}) => {
  const account = privateKeyToAccount(generatePrivateKey());
  await page.exposeFunction('testSignMessage', async (hex: string) =>
    account.signMessage({ message: hexToString(hex as Hex) }),
  );
  await page.addInitScript(
    ({ address }) => {
      const listeners: Record<string, ((value: unknown) => void)[]> = {};
      const provider = {
        async request({
          method,
          params,
        }: {
          method: string;
          params?: unknown[];
        }) {
          if (method === 'eth_accounts' || method === 'eth_requestAccounts')
            return [address];
          if (method === 'eth_chainId') return '0x' + (5042002).toString(16);
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
  await page
    .getByRole('button', { name: 'Connect wallet', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Your first job starts here' }),
  ).toBeVisible({ timeout: 30000 });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Your first job starts here' }),
  ).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: /Sign out/ }).click();
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
