import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/prisma';
import { nonceService } from '../src/services/nonceService';
import { AppError } from '../src/errors/AppError';

const WALLET_A = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8';
const WALLET_B = '0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc';

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}, but the call succeeded`);
}

describe('nonce service (live PostgreSQL)', () => {
  beforeAll(async () => {
    await prisma.nonce.deleteMany({
      where: { walletAddress: { in: [WALLET_A, WALLET_B] } },
    });
  });

  afterAll(async () => {
    await prisma.nonce.deleteMany({
      where: { walletAddress: { in: [WALLET_A, WALLET_B] } },
    });
  });

  it('generates 256-bit unpredictable values', () => {
    const a = nonceService.generateValue();
    const b = nonceService.generateValue();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(40); // 32 bytes base64url
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('issues a nonce bound to the wallet with an expiration', async () => {
    const issued = await nonceService.issue(WALLET_A);
    const row = await prisma.nonce.findUnique({ where: { value: issued.nonce } });
    expect(row).toBeTruthy();
    expect(row!.walletAddress).toBe(WALLET_A); // normalized lower-case
    expect(row!.usedAt).toBeNull();
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('stores unique values across many issuances', async () => {
    const values = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      values.add(nonceService.generateValue());
    }
    expect(values.size).toBe(50);
  });

  it('lookup rejects unknown, foreign-wallet and expired nonces', async () => {
    await expectCode(nonceService.lookup('does-not-exist-nonce', WALLET_A), 'NONCE_NOT_FOUND');

    const issued = await nonceService.issue(WALLET_A);
    await expectCode(nonceService.lookup(issued.nonce, WALLET_B), 'SIWE_NONCE_MISMATCH');

    // expired row created directly
    await prisma.nonce.create({
      data: {
        walletAddress: WALLET_B,
        value: 'expired-nonce-value-1234567890',
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await expectCode(
      nonceService.lookup('expired-nonce-value-1234567890', WALLET_B),
      'NONCE_EXPIRED',
    );
  });

  it('consumes exactly once (single-use)', async () => {
    const issued = await nonceService.issue(WALLET_A);
    await nonceService.consume(issued.nonce, WALLET_A);

    const row = await prisma.nonce.findUnique({ where: { value: issued.nonce } });
    expect(row!.usedAt).not.toBeNull();

    await expectCode(nonceService.lookup(issued.nonce, WALLET_A), 'NONCE_ALREADY_USED');
    await expectCode(nonceService.consume(issued.nonce, WALLET_A), 'NONCE_ALREADY_USED');
  });

  it('atomic consumption under a race: exactly one winner', async () => {
    const issued = await nonceService.issue(WALLET_A);
    const attempts = 12;

    const results = await Promise.allSettled(
      Array.from({ length: attempts }, () => nonceService.consume(issued.nonce, WALLET_A)),
    );

    const wins = results.filter((r) => r.status === 'fulfilled').length;
    const losses = results.filter(
      (r) => r.status === 'rejected' && (r.reason as AppError).code === 'NONCE_ALREADY_USED',
    ).length;

    expect(wins).toBe(1);
    expect(losses).toBe(attempts - 1);
  });

  it('cannot consume an expired nonce', async () => {
    await prisma.nonce.create({
      data: {
        walletAddress: WALLET_B,
        value: 'expired-consume-nonce-1234567890',
        expiresAt: new Date(Date.now() - 500),
      },
    });
    await expectCode(
      nonceService.consume('expired-consume-nonce-1234567890', WALLET_B),
      'NONCE_EXPIRED',
    );
    const row = await prisma.nonce.findUnique({
      where: { value: 'expired-consume-nonce-1234567890' },
    });
    expect(row!.usedAt).toBeNull(); // not consumed
  });

  it('cannot consume a nonce issued for another wallet', async () => {
    const issued = await nonceService.issue(WALLET_A);
    await expectCode(nonceService.consume(issued.nonce, WALLET_B), 'SIWE_NONCE_MISMATCH');
    const row = await prisma.nonce.findUnique({ where: { value: issued.nonce } });
    expect(row!.usedAt).toBeNull();
  });
});
