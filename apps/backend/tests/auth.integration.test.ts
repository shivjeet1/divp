import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Contract, HDNodeWallet, Mnemonic, Wallet } from 'ethers';
import {
  account,
  authed,
  buildSiweMessage,
  fetchConfig,
  getNonce,
  login,
  ORIGIN,
  prepareSiwe,
  testApp,
  verifyAttempt,
} from './helpers';
import { getProvider, IDENTITY_REGISTRY_ABI } from '../src/blockchain/registry';
import { config } from '../src/config';
import { prisma } from '../src/prisma';
import { signJwt } from '../src/security/jwt';

const app = testApp();
const USER = account(1); // seeded USER
const OPERATOR = account(2); // seeded OPERATOR
const ADMIN = account(3); // seeded ADMIN
const OUTSIDER = account(4); // never registered

// Use the backend's own provider singleton so that test-driven admin
// transactions and the backend's adminRegistry share one provider — two
// providers sending from the same Ganache account race on the tx nonce.
const provider = getProvider();
const ownerSigner = new Wallet(
  HDNodeWallet.fromMnemonic(
    Mnemonic.fromPhrase('test test test test test test test test test test test junk'),
    "m/44'/60'/0'/0/0",
  ).privateKey,
  provider,
);
const registry = new Contract(
  config.blockchain.contractAddress ?? '',
  IDENTITY_REGISTRY_ABI,
  ownerSigner,
);

describe('live stack: PostgreSQL + Ganache + IdentityRegistry', () => {
  beforeAll(async () => {
    // Ensure the USER wallet is active even if a previous run revoked it.
    const active = await registry.isActive(USER.address);
    if (!active) {
      const tx = await registry.registerIdentity(USER.address, 1);
      await tx.wait();
    }
  });

  afterAll(async () => {
    // Restore the USER wallet for subsequent runs.
    const active = await registry.isActive(USER.address);
    if (!active) {
      const tx = await registry.registerIdentity(USER.address, 1);
      await tx.wait();
    }
    await prisma.$disconnect();
  });

  // ------------------------------------------------------------------
  // Health & configuration
  // ------------------------------------------------------------------
  it('GET /health reports database, RPC and contract status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.checks.database.ok).toBe(true);
    expect(res.body.checks.rpc.ok).toBe(true);
    expect(res.body.checks.identityRegistry.ok).toBe(true);
  });

  it('GET /auth/config is public and matches server configuration', async () => {
    const cfg = await fetchConfig(app);
    expect(cfg.domain).toBe(config.siwe.domain);
    expect(cfg.chainId).toBe(config.blockchain.chainId);
    expect(cfg.version).toBe('1');
  });

  // ------------------------------------------------------------------
  // Nonce endpoint
  // ------------------------------------------------------------------
  it('POST /auth/nonce validates the address', async () => {
    const res = await request(app)
      .post('/auth/nonce')
      .set('Origin', ORIGIN)
      .send({ address: 'not-an-address' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  it('POST /auth/nonce requires an allowed Origin', async () => {
    const res = await request(app)
      .post('/auth/nonce')
      .set('Origin', 'https://evil.example')
      .send({ address: USER.address });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ORIGIN_NOT_ALLOWED');
  });

  it('POST /auth/nonce issues a wallet-bound nonce', async () => {
    const res = await request(app)
      .post('/auth/nonce')
      .set('Origin', ORIGIN)
      .send({ address: USER.address });
    expect(res.status).toBe(200);
    expect(res.body.nonce).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    const row = await prisma.nonce.findUnique({ where: { value: res.body.nonce } });
    expect(row?.walletAddress).toBe(USER.address.toLowerCase());
  });

  // ------------------------------------------------------------------
  // Happy path
  // ------------------------------------------------------------------
  it('full pipeline: nonce -> SIWE sign -> verify -> cookie -> /auth/me -> protected API', async () => {
    const attempt = await prepareSiwe(app, USER);
    const res = await verifyAttempt(app, attempt);

    expect(res.status).toBe(200);
    expect(res.body.authenticated).toBe(true);
    expect(res.body.role).toBe('USER');
    expect(res.body.walletAddress).toBe(USER.address);

    // Secure cookie attributes
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain(`${config.cookie.name}=`);
    const cookiePair = cookie.split(';')[0];

    const me = await authed(app, cookiePair).me();
    expect(me.status).toBe(200);
    expect(me.body.authenticated).toBe(true);
    expect(me.body.walletAddress).toBe(USER.address);
    expect(me.body.role).toBe('USER');

    const prot = await authed(app, cookiePair).protected();
    expect(prot.status).toBe(200);
    expect(prot.body.authenticated).toBe(true);
    expect(prot.body.walletAddress).toBe(USER.address);
    expect(prot.body.role).toBe('USER');
  });

  it('anonymous requests are rejected', async () => {
    const me = await request(app).get('/auth/me');
    expect(me.status).toBe(401);
    expect(me.body.error).toBe('AUTH_REQUIRED');

    const prot = await request(app).get('/api/protected');
    expect(prot.status).toBe(401);
  });

  // ------------------------------------------------------------------
  // Role authorization
  // ------------------------------------------------------------------
  it('role gates enforce USER < OPERATOR < ADMIN', async () => {
    const userSession = await login(app, USER);
    expect((await authed(app, userSession.cookie).operator()).status).toBe(403);
    expect((await authed(app, userSession.cookie).admin()).status).toBe(403);

    const operatorSession = await login(app, OPERATOR);
    expect((await authed(app, operatorSession.cookie).operator()).status).toBe(200);
    expect((await authed(app, operatorSession.cookie).admin()).status).toBe(403);

    const adminSession = await login(app, ADMIN);
    expect((await authed(app, adminSession.cookie).admin()).status).toBe(200);
    expect((await authed(app, adminSession.cookie).adminList()).status).toBe(200);
  });

  // ------------------------------------------------------------------
  // ATTACK 1 - Replay (captured message + signature reuse)
  // ------------------------------------------------------------------
  it('ATTACK 1: replaying a captured SIWE message is blocked', async () => {
    const attempt = await prepareSiwe(app, USER);
    const first = await verifyAttempt(app, attempt);
    expect(first.status).toBe(200);

    const replay = await verifyAttempt(app, attempt);
    expect(replay.status).toBe(401);
    expect(replay.body.error).toBe('NONCE_ALREADY_USED');
  });

  it('ATTACK 1b: concurrent replay race yields exactly one session', async () => {
    const attempt = await prepareSiwe(app, USER);
    const results = await Promise.all(Array.from({ length: 8 }, () => verifyAttempt(app, attempt)));
    const successes = results.filter((r) => r.status === 200);
    const blocked = results.filter((r) => r.status === 401);
    expect(successes).toHaveLength(1);
    expect(blocked).toHaveLength(7);
    expect(blocked.every((r) => r.body.error === 'NONCE_ALREADY_USED')).toBe(true);
  });

  // ------------------------------------------------------------------
  // ATTACK 2 - Expired nonce
  // ------------------------------------------------------------------
  it('ATTACK 2: an expired nonce is blocked', async () => {
    const cfg = await fetchConfig(app);
    const expiredValue = `expired-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await prisma.nonce.create({
      data: {
        walletAddress: USER.address.toLowerCase(),
        value: expiredValue,
        expiresAt: new Date(Date.now() - 60_000),
      },
    });
    const message = buildSiweMessage(cfg, USER.address, expiredValue);
    const signature = await USER.signMessage(message);

    const res = await verifyAttempt(app, { message, signature, nonce: expiredValue });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('NONCE_EXPIRED');
  });

  // ------------------------------------------------------------------
  // ATTACK 3 - Wrong wallet
  // ------------------------------------------------------------------
  it('ATTACK 3: signature from a different wallet than claimed is blocked', async () => {
    const cfg = await fetchConfig(app);
    // Nonce issued for the *claimed* wallet, but the OUTSIDER signs.
    const nonce = await getNonce(app, USER.address);
    const message = buildSiweMessage(cfg, USER.address, nonce);
    const signature = await OUTSIDER.signMessage(message);

    const res = await verifyAttempt(app, { message, signature, nonce });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('SIGNATURE_INVALID');
  });

  // ------------------------------------------------------------------
  // ATTACK 4 - Wrong chain
  // ------------------------------------------------------------------
  it('ATTACK 4: SIWE for a different chain id is blocked', async () => {
    const attempt = await prepareSiwe(app, USER, { chainId: 1 });
    const res = await verifyAttempt(app, attempt);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('SIWE_CHAIN_MISMATCH');
  });

  // ------------------------------------------------------------------
  // ATTACK 5 - Wrong domain / URI
  // ------------------------------------------------------------------
  it('ATTACK 5: SIWE for a foreign domain is blocked', async () => {
    const attempt = await prepareSiwe(app, USER, { domain: 'evil.example' });
    const res = await verifyAttempt(app, attempt);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('SIWE_DOMAIN_MISMATCH');
  });

  it('ATTACK 5b: SIWE for a foreign URI is blocked', async () => {
    const attempt = await prepareSiwe(app, USER, { uri: 'https://evil.example/login' });
    const res = await verifyAttempt(app, attempt);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('SIWE_URI_MISMATCH');
  });

  // ------------------------------------------------------------------
  // Expired SIWE message
  // ------------------------------------------------------------------
  it('ATTACK: an expired SIWE message is blocked', async () => {
    const attempt = await prepareSiwe(app, USER, {
      issuedAt: new Date(Date.now() - 120_000).toISOString(),
      expirationTime: new Date(Date.now() - 60_000).toISOString(),
    });
    const res = await verifyAttempt(app, attempt);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('SIWE_EXPIRED');
  });

  it('ATTACK: an unknown nonce is blocked', async () => {
    const cfg = await fetchConfig(app);
    const message = buildSiweMessage(cfg, USER.address, 'nonexistent-nonce-0987654321');
    const signature = await USER.signMessage(message);
    const res = await verifyAttempt(app, { message, signature, nonce: 'x' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('NONCE_NOT_FOUND');
  });

  it('ATTACK: a tampered signature is blocked', async () => {
    const attempt = await prepareSiwe(app, USER);
    const flipped =
      attempt.signature.slice(0, -2) + (attempt.signature.slice(-2) === '1b' ? '1c' : '1b');
    const res = await verifyAttempt(app, { ...attempt, signature: flipped });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('SIGNATURE_INVALID');
  });

  // ------------------------------------------------------------------
  // ATTACK 6 - Unauthorized wallet
  // ------------------------------------------------------------------
  it('ATTACK 6: a valid signature from an unregistered wallet is blocked', async () => {
    const attempt = await prepareSiwe(app, OUTSIDER);
    const res = await verifyAttempt(app, attempt);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('IDENTITY_NOT_REGISTERED');
  });

  // ------------------------------------------------------------------
  // Self-service registration (proof of ownership)
  // ------------------------------------------------------------------
  it('POST /auth/register registers a fresh wallet that signs a SIWE message', async () => {
    const fresh = Wallet.createRandom();
    const attempt = await prepareSiwe(app, fresh);

    const res = await request(app)
      .post('/auth/register')
      .set('Origin', ORIGIN)
      .send({ message: attempt.message, signature: attempt.signature });

    expect(res.status).toBe(201);
    expect(res.body.registered).toBe(true);
    expect(res.body.role).toBe('USER');
    expect(res.body.walletAddress).toBe(fresh.address);

    // The wallet is now registered → it can sign in.
    const loginAttempt = await prepareSiwe(app, fresh);
    const login = await verifyAttempt(app, loginAttempt);
    expect(login.status).toBe(200);
    expect(login.body.role).toBe('USER');
    expect(login.body.walletAddress).toBe(fresh.address);
  });

  it('POST /auth/register blocks registering an address the signer does not own', async () => {
    const fresh = Wallet.createRandom();
    const cfg = await fetchConfig(app);
    // Nonce + message are for `fresh`, but a DIFFERENT wallet signs.
    const nonce = await getNonce(app, fresh.address);
    const message = buildSiweMessage(cfg, fresh.address, nonce);
    const signature = await OUTSIDER.signMessage(message);

    const res = await request(app)
      .post('/auth/register')
      .set('Origin', ORIGIN)
      .send({ message, signature });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('SIGNATURE_INVALID');
  });

  it('POST /auth/register is replay-protected (single-use nonce)', async () => {
    const fresh = Wallet.createRandom();
    const attempt = await prepareSiwe(app, fresh);

    const first = await request(app)
      .post('/auth/register')
      .set('Origin', ORIGIN)
      .send({ message: attempt.message, signature: attempt.signature });
    expect(first.status).toBe(201);

    const replay = await request(app)
      .post('/auth/register')
      .set('Origin', ORIGIN)
      .send({ message: attempt.message, signature: attempt.signature });
    expect(replay.status).toBe(401);
    expect(replay.body.error).toBe('NONCE_ALREADY_USED');
  });

  it('POST /auth/register requires an allowed Origin (CSRF)', async () => {
    const fresh = Wallet.createRandom();
    const attempt = await prepareSiwe(app, fresh);
    const res = await request(app)
      .post('/auth/register')
      .send({ message: attempt.message, signature: attempt.signature });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ORIGIN_NOT_ALLOWED');
  });

  // ------------------------------------------------------------------
  // ATTACK 7 - Revoked identity
  // ------------------------------------------------------------------
  it('ATTACK 7: a revoked wallet cannot authenticate (and existing sessions die)', async () => {
    // Establish a session first.
    const session = await login(app, USER);
    expect((await authed(app, session.cookie).me()).status).toBe(200);

    // Revoke on-chain (as the registry owner).
    const revokeTx = await registry.revokeIdentity(USER.address);
    await revokeTx.wait();

    // Existing session is rejected because the contract is authoritative.
    const afterRevoke = await authed(app, session.cookie).me();
    expect(afterRevoke.status).toBe(403);
    expect(afterRevoke.body.error).toBe('IDENTITY_INACTIVE');

    // Fresh login attempt is rejected too.
    const attempt = await prepareSiwe(app, USER);
    const res = await verifyAttempt(app, attempt);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('IDENTITY_INACTIVE');

    // Restore for other tests.
    const restoreTx = await registry.registerIdentity(USER.address, 1);
    await restoreTx.wait();
  });

  // ------------------------------------------------------------------
  // ATTACK 8 - JWT tampering
  // ------------------------------------------------------------------
  it('ATTACK 8: tampering with the JWT payload is blocked', async () => {
    const session = await login(app, USER);
    const token = session.cookie.split('=')[1];
    const [h, p, s] = token.split('.');

    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    expect(payload.role).toBe('USER');
    payload.role = 'ADMIN'; // privilege escalation attempt
    const tamperedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const tampered = `${h}.${tamperedPayload}.${s}`;

    const res = await request(app)
      .get('/auth/me')
      .set('Cookie', `${config.cookie.name}=${tampered}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TOKEN_SIGNATURE_INVALID');

    // The escalated token must not open the admin resource.
    const adminRes = await request(app)
      .get('/api/protected/admin')
      .set('Cookie', `${config.cookie.name}=${tampered}`);
    expect(adminRes.status).toBe(401);
  });

  it('ATTACK 8b: a JWT signed with the wrong secret is blocked', async () => {
    const forged = signJwt(
      {
        sub: USER.address.toLowerCase(),
        role: 'ADMIN',
        iss: config.jwt.issuer,
        aud: config.jwt.audience,
        ttlSeconds: 600,
      },
      'forged-secret-forged-secret-forged-secret',
    );
    const res = await request(app)
      .get('/auth/me')
      .set('Cookie', `${config.cookie.name}=${forged.token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TOKEN_SIGNATURE_INVALID');
  });

  // ------------------------------------------------------------------
  // ATTACK 9 - JWT expiration
  // ------------------------------------------------------------------
  it('ATTACK 9: an expired JWT is blocked', async () => {
    const expired = signJwt(
      {
        sub: USER.address.toLowerCase(),
        role: 'USER',
        iss: config.jwt.issuer,
        aud: config.jwt.audience,
        ttlSeconds: -30,
      },
      config.jwt.secret,
    );
    const res = await request(app)
      .get('/auth/me')
      .set('Cookie', `${config.cookie.name}=${expired.token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TOKEN_EXPIRED');
  });

  it('ATTACK: a JWT with the wrong issuer/audience is blocked', async () => {
    const wrongIss = signJwt(
      {
        sub: USER.address.toLowerCase(),
        role: 'USER',
        iss: 'someone-else',
        aud: config.jwt.audience,
        ttlSeconds: 600,
      },
      config.jwt.secret,
    );
    const res = await request(app)
      .get('/auth/me')
      .set('Cookie', `${config.cookie.name}=${wrongIss.token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('TOKEN_CLAIM_INVALID');
  });

  // ------------------------------------------------------------------
  // Logout / session revocation
  // ------------------------------------------------------------------
  it('logout revokes the session server-side', async () => {
    const session = await login(app, USER);
    const out = await authed(app, session.cookie).logout();
    expect(out.status).toBe(200);

    const after = await authed(app, session.cookie).me();
    expect(after.status).toBe(401);
    expect(after.body.error).toBe('SESSION_REVOKED');

    // Cookie clearing
    const setCookie = (out.headers['set-cookie'] as unknown as string[])[0];
    expect(setCookie).toContain(`${config.cookie.name}=;`);
  });

  // ------------------------------------------------------------------
  // CSRF / CORS
  // ------------------------------------------------------------------
  it('CORS: allowed origin gets credentials-enabled headers, foreign origin does not', async () => {
    const allowed = await request(app).get('/health').set('Origin', ORIGIN);
    expect(allowed.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');

    const foreign = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(foreign.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('CORS: preflight for the allowed origin succeeds', async () => {
    const res = await request(app)
      .options('/auth/verify')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'POST');
    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
  });

  it('CSRF: state-changing request without Origin is rejected', async () => {
    const res = await request(app).post('/auth/nonce').send({ address: USER.address });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ORIGIN_NOT_ALLOWED');
  });

  // ------------------------------------------------------------------
  // Client events + error hygiene
  // ------------------------------------------------------------------
  it('accepts MetaMask account/chain change events for auditing', async () => {
    const res = await request(app)
      .post('/auth/events')
      .set('Origin', ORIGIN)
      .send({ event: 'ACCOUNT_CHANGED', walletAddress: USER.address, chainId: 1337 });
    expect(res.status).toBe(202);

    const row = await prisma.auditLog.findFirst({
      where: { event: 'ACCOUNT_CHANGED' },
      orderBy: { timestamp: 'desc' },
    });
    expect(row).toBeTruthy();
    expect(row!.walletAddress).toBe(USER.address.toLowerCase());
  });

  it('error responses are structured and leak no internals', async () => {
    const res = await request(app)
      .post('/auth/verify')
      .set('Origin', ORIGIN)
      .send({ message: 'garbage', signature: '0x1234' });
    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body).toHaveProperty('message');
    expect(res.body.stack).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/node_modules|at Object|prisma/);
  });

  it('persists audit events for the authentication lifecycle', async () => {
    const events = await prisma.auditLog.findMany({
      where: {
        event: {
          in: ['NONCE_CREATED', 'SIGNATURE_VERIFIED', 'SESSION_CREATED', 'IDENTITY_AUTHORIZED'],
        },
      },
      take: 1,
    });
    expect(events.length).toBeGreaterThan(0);

    const failed = await prisma.auditLog.findFirst({
      where: { event: 'SIGNATURE_VERIFICATION_FAILED' },
    });
    expect(failed).toBeTruthy();
  });

  it('never stores signature material or secrets in the audit trail', async () => {
    const rows = await prisma.auditLog.findMany({ take: 50 });
    for (const row of rows) {
      const text = JSON.stringify(row);
      expect(text).not.toMatch(/0x[0-9a-fA-F]{130}/); // raw signatures
      expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}/); // JWTs
    }
  });

  // ------------------------------------------------------------------
  // Self-registration hardening (Fix 1)
  // ------------------------------------------------------------------
  it('POST /auth/register cannot re-register a revoked wallet (no revocation bypass)', async () => {
    const target = account(5); // unused by other tests
    // Make the wallet known to the registry, then revoke it.
    await (await registry.registerIdentity(target.address, 1)).wait();
    await (await registry.revokeIdentity(target.address)).wait();

    // A valid signature from the revoked wallet must NOT reactivate it.
    const attempt = await prepareSiwe(app, target);
    const res = await request(app)
      .post('/auth/register')
      .set('Origin', ORIGIN)
      .send({ message: attempt.message, signature: attempt.signature });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ALREADY_REGISTERED');

    // And it must not have been reactivated on-chain.
    expect(await registry.isActive(target.address)).toBe(false);
  });

  // ------------------------------------------------------------------
  // Live on-chain role enforcement (Fix 2)
  // ------------------------------------------------------------------
  it('a downgraded role is enforced on the very next request', async () => {
    // Establish an ADMIN session.
    const session = await login(app, ADMIN);
    expect((await authed(app, session.cookie).admin()).status).toBe(200);

    // Downgrade ADMIN -> USER on-chain.
    await (await registry.setRole(ADMIN.address, 1)).wait();

    // The stale ADMIN session must now be forbidden from the admin route.
    const after = await authed(app, session.cookie).admin();
    expect(after.status).toBe(403);
    expect(after.body.error).toBe('ROLE_FORBIDDEN');

    // Restore.
    await (await registry.setRole(ADMIN.address, 3)).wait();
  });

  // ------------------------------------------------------------------
  // Admin revoke kills active Web2 sessions (Fix 3)
  // ------------------------------------------------------------------
  it('admin revoke kills active sessions even with on-chain re-check disabled', async () => {
    const original = config.session.recheckOnchain;
    // Disable the per-request on-chain re-check so the ONLY thing that can
    // reject the user below is the server-side session revocation.
    (config.session as { recheckOnchain: boolean }).recheckOnchain = false;
    let adminCookie: string | undefined;
    try {
      const session = await login(app, USER);
      expect((await authed(app, session.cookie).me()).status).toBe(200);

      // Admin revokes USER (on-chain + server-side).
      const adminSession = await login(app, ADMIN);
      adminCookie = adminSession.cookie;
      const del = await request(app)
        .delete(`/admin/identities/${USER.address}`)
        .set('Cookie', adminSession.cookie)
        .set('Origin', ORIGIN);
      expect(del.status).toBe(200);

      // The previously-active session is now revoked server-side.
      const after = await authed(app, session.cookie).me();
      expect(after.status).toBe(401);
      expect(after.body.error).toBe('SESSION_REVOKED');
    } finally {
      config.session.recheckOnchain = original;
      // Restore USER via the backend admin API (same admin provider as the
      // revoke above, avoiding cross-provider nonce races on account #0).
      if (adminCookie) {
        await request(app)
          .post('/admin/identities')
          .set('Cookie', adminCookie)
          .set('Origin', ORIGIN)
          .send({ address: USER.address, role: 'USER' });
      }
    }
  });
});
