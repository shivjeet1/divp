import express from 'express';
import request from 'supertest';
import { HDNodeWallet, Mnemonic } from 'ethers';
import { createApp } from '../src/app';
import { config } from '../src/config';

export const MNEMONIC = 'test test test test test test test test test test test junk';
export const ORIGIN = config.urls.corsOrigins[0];

/** Dev accounts derived from the deterministic Ganache mnemonic. */
export function account(index: number): HDNodeWallet {
  return HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(MNEMONIC), `m/44'/60'/0'/0/${index}`);
}

export function testApp(): express.Express {
  return createApp();
}

export interface SiweOverrides {
  domain?: string;
  uri?: string;
  chainId?: number;
  nonce?: string;
  issuedAt?: string;
  expirationTime?: string;
  address?: string;
  statement?: string;
  omitExpiration?: boolean;
}

/** Builds an EIP-4361 message exactly the way the frontend does. */
export function buildSiweMessage(
  cfg: {
    domain: string;
    uri: string;
    statement: string;
    chainId: number;
  },
  address: string,
  nonce: string,
  overrides: SiweOverrides = {},
): string {
  const issuedAt = overrides.issuedAt ?? new Date().toISOString();
  const expirationTime =
    overrides.expirationTime ?? new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const lines = [
    `${overrides.domain ?? cfg.domain} wants you to sign in with your Ethereum account:`,
    overrides.address ?? address,
    '',
    overrides.statement ?? cfg.statement,
    '',
    `URI: ${overrides.uri ?? cfg.uri}`,
    'Version: 1',
    `Chain ID: ${overrides.chainId ?? cfg.chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ];
  if (!overrides.omitExpiration) lines.push(`Expiration Time: ${expirationTime}`);
  lines.push(`Request ID: test-request-${nonce.slice(0, 8)}`);
  return lines.join('\n');
}

export async function fetchConfig(app = testApp()) {
  const res = await request(app).get('/auth/config').expect(200);
  return res.body as {
    domain: string;
    uri: string;
    statement: string;
    chainId: number;
    version: string;
  };
}

export async function getNonce(app: testAppType, address: string): Promise<string> {
  const res = await request(app)
    .post('/auth/nonce')
    .set('Origin', ORIGIN)
    .send({ address })
    .expect(200);
  return res.body.nonce as string;
}

type testAppType = ReturnType<typeof testApp>;

export interface SignedAttempt {
  message: string;
  signature: string;
  nonce: string;
}

/** nonce -> message -> wallet signature, mirroring the frontend flow. */
export async function prepareSiwe(
  app: testAppType,
  wallet: HDNodeWallet,
  overrides: SiweOverrides = {},
  cfg?: Awaited<ReturnType<typeof fetchConfig>>,
): Promise<SignedAttempt> {
  const configNow = cfg ?? (await fetchConfig(app));
  const nonce = await getNonce(app, overrides.address ?? wallet.address);
  const message = buildSiweMessage(configNow, wallet.address, nonce, overrides);
  const signature = await wallet.signMessage(message);
  return { message, signature, nonce };
}

export async function verifyAttempt(app: testAppType, attempt: SignedAttempt) {
  return request(app)
    .post('/auth/verify')
    .set('Origin', ORIGIN)
    .send({ message: attempt.message, signature: attempt.signature });
}

export async function login(
  app: testAppType,
  wallet: HDNodeWallet,
): Promise<{ cookie: string; body: Record<string, unknown> }> {
  const attempt = await prepareSiwe(app, wallet);
  const res = await verifyAttempt(app, attempt);
  if (res.status !== 200) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  const cookie = (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
  return { cookie, body: res.body };
}

export function authed(app: testAppType, cookie: string) {
  return {
    me: () => request(app).get('/auth/me').set('Cookie', cookie),
    protected: () => request(app).get('/api/protected').set('Cookie', cookie),
    operator: () => request(app).get('/api/protected/operator').set('Cookie', cookie),
    admin: () => request(app).get('/api/protected/admin').set('Cookie', cookie),
    logout: () => request(app).post('/auth/logout').set('Origin', ORIGIN).set('Cookie', cookie),
    adminList: () => request(app).get('/admin/identities').set('Cookie', cookie),
  };
}
