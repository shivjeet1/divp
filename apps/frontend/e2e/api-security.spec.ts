/**
 * API-level E2E attack demos (attacks 1, 8, 9, logout) against the real,
 * running backend + Ganache contract.
 *
 * Uses Playwright's APIRequestContext against http://localhost:4000, signing
 * real EIP-4361 messages with the deterministic test-key wallets. The browser
 * UI equivalents live in auth.spec.ts.
 */
import { createHmac } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { ethers } from 'ethers';
import { ACCOUNT, TestAccount } from './provider';

const BACKEND = 'http://localhost:4000';

function rootEnv(name: string): string {
  const value = process.env[name];
  if (value) return value;
  const root = path.resolve(__dirname, '../../..');
  const envFile = fs.existsSync(path.join(root, '.env'))
    ? fs.readFileSync(path.join(root, '.env'), 'utf8')
    : '';
  const line = envFile.split('\n').find((l) => l.startsWith(`${name}=`));
  const found = line?.slice(name.length + 1).replace(/^["']|["']$/g, '');
  if (!found) throw new Error(`${name} not found in environment or root .env`);
  return found;
}

const JWT_SECRET = rootEnv('JWT_SECRET');
const JWT_ISSUER = process.env.JWT_ISSUER ?? 'identity-auth-server';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE ?? 'identity-web-app';
/** Cookie name - keep in sync with COOKIE_NAME / auth/config. */
const COOKIE_NAME = 'divp_session';

function b64url(input: object | string): string {
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  return Buffer.from(raw).toString('base64url');
}

const MUTATING = { headers: { Origin: 'http://localhost:3000' } } as const;

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

interface BackendConfigLike {
  chainId: number;
  domain: string;
  uri: string;
  statement: string;
  version: string;
  nonceTtlSeconds: number;
  contractAddress: string | null;
  cookieName: string;
}

type ApiRequest = APIRequestContext;

async function login(
  request: ApiRequest,
  account: TestAccount,
): Promise<{
  message: string;
  signature: string;
  session: Record<string, unknown>;
  cookie: string | null;
}> {
  const config = (await (await request.get(`${BACKEND}/auth/config`)).json()) as BackendConfigLike;
  expect(config.chainId).toBe(1337);

  const nonceRes = await request.post(`${BACKEND}/auth/nonce`, {
    ...MUTATING,
    headers: { ...MUTATING.headers, 'Content-Type': 'application/json' },
    data: { address: account.addressChecksummed },
  });
  expect(nonceRes.status()).toBe(200);
  const nonce = (await nonceRes.json()) as { nonce: string };

  const wallet = new ethers.Wallet(account.key);
  const now = new Date();
  const issuedAt = now.toISOString();
  const expirationTime = new Date(now.getTime() + 300_000).toISOString();
  const message = [
    `${config.domain} wants you to sign in with your Ethereum account:`,
    ethers.getAddress(account.addressChecksummed),
    '',
    config.statement,
    '',
    `URI: ${config.uri}`,
    `Version: ${config.version}`,
    `Chain ID: ${config.chainId}`,
    `Nonce: ${nonce.nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expirationTime}`,
    `Request ID: e2e-${Math.random().toString(36).slice(2, 10)}`,
  ].join('\n');
  const signature = await wallet.signMessage(message);

  const verifyRes = await request.post(`${BACKEND}/auth/verify`, {
    ...MUTATING,
    headers: { ...MUTATING.headers, 'Content-Type': 'application/json' },
    data: { message, signature },
  });
  expect(verifyRes.status()).toBe(200);
  const session = await verifyRes.json();

  const cookie = verifyRes.headers()['set-cookie']?.split(';')[0] ?? null;
  return { message, signature, session, cookie };
}

function forgeJwt(overrides: Record<string, unknown>, secret: string): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: 'HS256', typ: 'JWT' });
  const payload = b64url({
    sub: ACCOUNT.USER_1.address,
    role: 'USER',
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    iat: nowSec,
    exp: nowSec + 3600,
    jti: `e2e-${Math.random().toString(36).slice(2, 10)}`,
    ...overrides,
  });
  const signingInput = `${header}.${payload}`;
  const sig = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${sig}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('API-level attack demos', () => {
  test('ATTACK 1: replaying a consumed SIWE message is blocked', async ({ request }) => {
    const { message, signature } = await login(request, ACCOUNT.USER_1);

    const replay = await request.post(`${BACKEND}/auth/verify`, {
      ...MUTATING,
      headers: { ...MUTATING.headers, 'Content-Type': 'application/json' },
      data: { message, signature },
    });
    expect(replay.status()).toBe(401);
    const body = (await replay.json()) as { error: string };
    expect(body.error).toBe('NONCE_ALREADY_USED');
  });

  test('ATTACK 8: tampering with the JWT session cookie is blocked', async ({ request }) => {
    const { cookie } = await login(request, ACCOUNT.USER_1);
    expect(cookie).toBeTruthy();

    // Tamper: flip the last base64url character of the signature part
    const [header, payload, sig] = cookie!.split('.');
    const tamperedSig = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
    const tampered = `${header}.${payload}.${tamperedSig}`;

    const me = await request.get(`${BACKEND}/auth/me`, {
      headers: { Cookie: tampered },
    });
    expect(me.status()).toBe(401);
    const body = (await me.json()) as { error: string };
    expect(['TOKEN_SIGNATURE_INVALID', 'TOKEN_INVALID']).toContain(body.error);
  });

  test('ATTACK 8b: a JWT forged with a wrong secret is blocked', async ({ request }) => {
    const { cookie } = await login(request, ACCOUNT.USER_1);
    const forged = forgeJwt({}, 'this-is-not-the-real-secret-0123456789abcdef');

    const me = await request.get(`${BACKEND}/auth/me`, {
      headers: { Cookie: `${COOKIE_NAME}=${forged}` },
    });
    expect(me.status()).toBe(401);
    const body = (await me.json()) as { error: string };
    expect(['TOKEN_SIGNATURE_INVALID', 'TOKEN_INVALID']).toContain(body.error);
    expect(cookie).toBeTruthy();
  });

  test('ATTACK 9: a correctly signed but expired JWT is blocked', async ({ request }) => {
    await login(request, ACCOUNT.USER_1);
    const nowSec = Math.floor(Date.now() / 1000);
    const expired = forgeJwt(
      { iat: nowSec - 7200, exp: nowSec - 3600, jti: `expired-${nowSec}` },
      JWT_SECRET,
    );

    const me = await request.get(`${BACKEND}/auth/me`, {
      headers: { Cookie: `${COOKIE_NAME}=${expired}` },
    });
    expect(me.status()).toBe(401);
    const body = (await me.json()) as { error: string };
    expect(body.error).toBe('TOKEN_EXPIRED');
  });

  test('logout revokes the session: protected API returns AUTH_REQUIRED afterwards', async ({
    request,
  }) => {
    const { cookie } = await login(request, ACCOUNT.USER_1);

    const before = await request.get(`${BACKEND}/api/protected`, { headers: { Cookie: cookie! } });
    expect(before.status()).toBe(200);

    const logout = await request.post(`${BACKEND}/auth/logout`, MUTATING);
    expect(logout.status()).toBe(200);

    const after = await request.get(`${BACKEND}/api/protected`, { headers: { Cookie: cookie! } });
    expect(after.status()).toBe(401);
    const body = (await after.json()) as { error: string };
    expect(['SESSION_REVOKED', 'AUTH_REQUIRED']).toContain(body.error);
  });

  test('an expired session row is rejected even with an unexpired, validly-signed JWT', async ({
    request,
  }) => {
    await login(request, ACCOUNT.USER_1);
    // Not tweaking the clock here - instead reuse a signed token whose jti has
    // no backing session row (forged with the REAL secret): server-side state
    // is authoritative.
    const ghost = forgeJwt({ jti: `ghost-${Date.now()}` }, JWT_SECRET);
    const me = await request.get(`${BACKEND}/auth/me`, {
      headers: { Cookie: `${COOKIE_NAME}=${ghost}` },
    });
    expect(me.status()).toBe(401);
    const body = (await me.json()) as { error: string };
    expect(['SESSION_NOT_FOUND', 'SESSION_REVOKED', 'SESSION_EXPIRED']).toContain(body.error);
  });
});
