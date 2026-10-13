import { afterAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Contract, JsonRpcProvider } from 'ethers';
import { account, authed, login, ORIGIN, testApp } from './helpers';
import { IDENTITY_REGISTRY_ABI } from '../src/blockchain/registry';
import { config } from '../src/config';
import { prisma } from '../src/prisma';

const app = testApp();
const ADMIN = account(3);
const USER = account(1);
const TARGET = account(5); // wallet managed through the admin API

const provider = new JsonRpcProvider(config.blockchain.rpcUrl, undefined, {
  staticNetwork: true,
  cacheTimeout: -1, // avoid stale nonces on back-to-back admin txs
});
const readRegistry = new Contract(
  config.blockchain.contractAddress ?? '',
  IDENTITY_REGISTRY_ABI,
  provider,
);

describe('administrative API (optional PRD endpoints)', () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('requires authentication', async () => {
    for (const method of ['get', 'post', 'patch', 'delete'] as const) {
      const path =
        method === 'patch' || method === 'delete'
          ? `/admin/identities/${TARGET.address}`
          : '/admin/identities';
      const req = request(app)[method](path).set('Origin', ORIGIN);
      const res = method === 'get' ? await req : await req.send({ role: 'USER' });
      expect(res.status).toBe(401);
    }
  });

  it('requires the ADMIN role', async () => {
    const userSession = await login(app, USER);
    expect((await authed(app, userSession.cookie).adminList()).status).toBe(403);
  });

  it('lists on-chain identities for an ADMIN', async () => {
    const adminSession = await login(app, ADMIN);
    const res = await authed(app, adminSession.cookie).adminList();
    expect(res.status).toBe(200);
    const wallets = res.body.identities.map((i: { walletAddress: string }) =>
      i.walletAddress.toLowerCase(),
    );
    expect(wallets).toContain(ADMIN.address.toLowerCase());
    expect(wallets).toContain(USER.address.toLowerCase());
    const adminIdentity = res.body.identities.find(
      (i: { walletAddress: string }) =>
        i.walletAddress.toLowerCase() === ADMIN.address.toLowerCase(),
    );
    expect(adminIdentity).toMatchObject({ active: true, role: 'ADMIN' });
  });

  it('registers, updates and revokes an identity through the API', async () => {
    const adminSession = await login(app, ADMIN);

    // Start from a clean slate (idempotent across runs).
    if (await readRegistry.isActive(TARGET.address)) {
      await authed(app, adminSession.cookie)
        .delete(`/admin/identities/${TARGET.address}`)
        .expect(200);
    }

    // POST /admin/identities
    const created = await request(app)
      .post('/admin/identities')
      .set('Origin', ORIGIN)
      .set('Cookie', adminSession.cookie)
      .send({ address: TARGET.address, role: 'USER' });
    expect(created.status).toBe(201);
    expect(await readRegistry.isActive(TARGET.address)).toBe(true);
    expect(Number(await readRegistry.getRole(TARGET.address))).toBe(1);

    // PATCH /admin/identities/:address
    const patched = await request(app)
      .patch(`/admin/identities/${TARGET.address}`)
      .set('Origin', ORIGIN)
      .set('Cookie', adminSession.cookie)
      .send({ role: 'OPERATOR' });
    expect(patched.status).toBe(200);
    expect(Number(await readRegistry.getRole(TARGET.address))).toBe(2);

    // DELETE /admin/identities/:address
    const revoked = await request(app)
      .delete(`/admin/identities/${TARGET.address}`)
      .set('Origin', ORIGIN)
      .set('Cookie', adminSession.cookie);
    expect(revoked.status).toBe(200);
    expect(await readRegistry.isActive(TARGET.address)).toBe(false);
    expect(Number(await readRegistry.getRole(TARGET.address))).toBe(0);

    // The list reflects the revocation.
    const list = await authed(app, adminSession.cookie).adminList();
    const targetRow = list.body.identities.find(
      (i: { walletAddress: string }) =>
        i.walletAddress.toLowerCase() === TARGET.address.toLowerCase(),
    );
    expect(targetRow).toMatchObject({ active: false, role: 'NONE' });
  });

  it('rejects invalid addresses', async () => {
    const adminSession = await login(app, ADMIN);
    const res = await request(app)
      .post('/admin/identities')
      .set('Origin', ORIGIN)
      .set('Cookie', adminSession.cookie)
      .send({ address: '0xdeadbeef', role: 'USER' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });
});
