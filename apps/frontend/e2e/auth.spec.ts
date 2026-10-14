import { expect, Page, test } from '@playwright/test';
import { ACCOUNT, connectRandomWallet, installProvider, TestAccount } from './provider';

/**
 * Browser-level E2E of the full pipeline:
 *   MetaMask connect → nonce → SIWE signature → on-chain verification →
 *   JWT cookie session → protected Web2 API → logout,
 * plus account/network switch and unregistered-wallet attack demos.
 */

async function authenticated(page: Page, account: TestAccount): Promise<void> {
  await page.getByTestId('connect-button').click();
  await expect(page.getByTestId('auth-status')).toHaveText('Connected');
  await page.getByTestId('signin-button').click();
  await expect(page.getByTestId('auth-status')).toHaveText('Authenticated', {
    timeout: 20_000,
  });
  await expect(page.getByTestId('session-wallet')).toContainText(account.addressChecksummed);
  await expect(page.getByTestId('session-role')).toHaveText(account.role);
}

test.describe('full authentication pipeline (browser)', () => {
  test('USER happy path: connect → sign → authenticated → protected API → logout', async ({
    page,
  }) => {
    await installProvider(page, ACCOUNT.USER_1);

    // Pipeline steps start unvisited
    await expect(page.getByTestId('connect-button')).toBeVisible();
    await expect(page.getByTestId('wallet-address')).toHaveText(/—/);

    await authenticated(page, ACCOUNT.USER_1);

    // Protected Web2 API was fetched automatically after authentication
    await expect(page.getByTestId('protected-wallet')).toContainText(
      ACCOUNT.USER_1.addressChecksummed,
    );

    // Role gate: USER is forbidden from the admin endpoint
    await page.getByTestId('call-admin').click();
    await expect(
      page
        .locator('[data-testid="auth-notice"], .alert.error', { hasText: /does not permit/i })
        .first(),
    ).toBeVisible();

    // Logout revokes the server session and clears the cookie
    await page.getByTestId('logout-button').click();
    await expect(page.getByTestId('auth-status')).toHaveText('Connected');
    await expect(page.getByTestId('no-session')).toBeVisible();
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'divp_session')).toBeUndefined();
  });

  test('OPERATOR can call the operator endpoint, not the admin endpoint', async ({ page }) => {
    await installProvider(page, ACCOUNT.OPERATOR_2);
    await authenticated(page, ACCOUNT.OPERATOR_2);

    await page.getByTestId('call-operator').click();
    await expect(page.locator('[data-testid="protected-card"] .alert.notice')).toContainText(
      'Operator-level resource accessed.',
    );

    await page.getByTestId('call-admin').click();
    await expect(page.locator('.alert.error', { hasText: /does not permit/i })).toBeVisible();
  });

  test('ADMIN can call the admin endpoint', async ({ page }) => {
    await installProvider(page, ACCOUNT.ADMIN_0);
    await authenticated(page, ACCOUNT.ADMIN_0);

    await page.getByTestId('call-admin').click();
    await expect(page.locator('[data-testid="protected-card"] .alert.notice')).toContainText(
      'Admin-level resource accessed.',
    );
    await expect(page.getByTestId('session-role')).toHaveText('ADMIN');
  });

  test('an unregistered wallet is rejected by the on-chain registry', async ({ page }) => {
    await installProvider(page, ACCOUNT.UNREGISTERED_4);
    await authenticatedAttempt(page);
    await expect(page.getByTestId('auth-status')).toHaveText('Authentication failed');
    await expect(page.getByTestId('auth-error')).toContainText('not registered');
    await expect(page.getByTestId('session-card')).toContainText('No active session');
  });

  test('self-registration: an unregistered wallet can register itself with proof of ownership', async ({
    page,
  }) => {
    // Bootstrap the provider, then switch to a fresh random wallet so the
    // test is idempotent across runs on the persistent chain.
    await installProvider(page, ACCOUNT.USER_1);
    const wallet = await connectRandomWallet(page);

    // The registration card appears (connected, not authenticated)
    await expect(page.getByTestId('register-card')).toBeVisible();

    // The input is pre-filled with the connected (random) wallet; register it
    await expect(page.getByTestId('register-address')).toHaveValue(wallet.addressChecksummed);
    await page.getByTestId('register-button').click();

    // Backend re-verifies the signature and registers on-chain as USER
    await expect(page.getByTestId('auth-notice')).toContainText('registered as USER', {
      timeout: 20_000,
    });

    // The wallet is now registered → sign-in succeeds
    await page.getByTestId('signin-button').click();
    await expect(page.getByTestId('auth-status')).toHaveText('Authenticated', { timeout: 20_000 });
    await expect(page.getByTestId('session-wallet')).toContainText(wallet.addressChecksummed);
    await expect(page.getByTestId('session-role')).toHaveText('USER');
  });

  test('network switch mid-session forces re-authentication (wrong_network)', async ({ page }) => {
    await installProvider(page, ACCOUNT.USER_1);
    await authenticated(page, ACCOUNT.USER_1);

    // Simulate MetaMask switching to Ethereum mainnet
    await page.evaluate(() => {
      (
        window as unknown as { __divp: { state: { chainIdHex: string }; persist(): void } }
      ).__divp.state.chainIdHex = '0x1';
      (window as unknown as { __divp: { persist(): void } }).__divp.persist();
      (window as unknown as { __divpEmit: (e: string, ...a: unknown[]) => void }).__divpEmit(
        'chainChanged',
        '0x1',
      );
    });

    await expect(page.getByTestId('auth-status')).toHaveText('Wrong network');
    await expect(page.getByTestId('network')).toContainText('chainId 1');
    // Session was revoked server-side too: protected API now fails
    await expect(page.getByTestId('protected-wallet')).toHaveCount(0);

    // Switch back to chainId 1337 and re-authenticate
    await page.evaluate(() => {
      (
        window as unknown as { __divp: { state: { chainIdHex: string }; persist(): void } }
      ).__divp.state.chainIdHex = '0x539';
      (window as unknown as { __divp: { persist(): void } }).__divp.persist();
      (window as unknown as { __divpEmit: (e: string, ...a: unknown[]) => void }).__divpEmit(
        'chainChanged',
        '0x539',
      );
    });
    await expect(page.getByTestId('auth-status')).toHaveText('Connected');
    await page.getByTestId('signin-button').click();
    await expect(page.getByTestId('auth-status')).toHaveText('Authenticated', { timeout: 20_000 });
  });

  test('account switch mid-session revokes the old session and refuses the new wallet', async ({
    page,
  }) => {
    await installProvider(page, ACCOUNT.USER_1);
    await authenticated(page, ACCOUNT.USER_1);

    // MetaMask switches from wallet #1 (USER) to wallet #4 (unregistered)
    await switchAccount(page, ACCOUNT.UNREGISTERED_4.address);
    await expect(page.getByTestId('session-card')).toContainText('No active session');
    await expect(page.getByTestId('wallet-address')).toContainText(ACCOUNT.UNREGISTERED_4.address);

    // The new wallet must sign for itself and is rejected on-chain
    await page.getByTestId('signin-button').click();
    await expect(page.getByTestId('auth-status')).toHaveText('Authentication failed');
    await expect(page.getByTestId('auth-error')).toContainText('not registered');

    // The previously authenticated wallet's cookie/session is gone
    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'divp_session')).toBeUndefined();
  });

  test('session survives reload while wallet matches, then restore is invalidated by a switch', async ({
    page,
  }) => {
    await installProvider(page, ACCOUNT.USER_1);
    await authenticated(page, ACCOUNT.USER_1);

    // Reload: cookie session + still-connected wallet → restored automatically
    await page.reload();
    await expect(page.getByTestId('auth-status')).toHaveText('Authenticated', { timeout: 20_000 });
    await expect(page.getByTestId('session-wallet')).toContainText(
      ACCOUNT.USER_1.addressChecksummed,
    );

    // Now switch the wallet and reload again: the old session must NOT survive
    await switchAccount(page, ACCOUNT.UNREGISTERED_4.address);
    await page.reload();
    await expect(page.getByTestId('session-card')).toContainText('No active session');
    await expect(page.getByTestId('wallet-address')).toContainText(ACCOUNT.UNREGISTERED_4.address);
  });
});

async function authenticatedAttempt(page: Page): Promise<void> {
  await page.getByTestId('connect-button').click();
  await expect(page.getByTestId('auth-status')).toHaveText('Connected');
  await page.getByTestId('signin-button').click();
}

async function switchAccount(page: Page, address: string): Promise<void> {
  await page.evaluate((addr) => {
    (
      window as unknown as { __divp: { state: { accounts: string[] }; persist(): void } }
    ).__divp.state.accounts = [addr];
    (window as unknown as { __divp: { persist(): void } }).__divp.persist();
    (window as unknown as { __divpEmit: (e: string, ...a: unknown[]) => void }).__divpEmit(
      'accountsChanged',
      [addr],
    );
  }, address);
}
