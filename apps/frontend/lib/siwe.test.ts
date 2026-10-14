import { describe, expect, it } from 'vitest';
import { buildSiweMessage } from '@/lib/siwe';
import type { BackendConfig, NonceResponse } from '@/types';

const config: BackendConfig = {
  chainId: 1337,
  domain: 'localhost:3000',
  uri: 'http://localhost:3000',
  statement: 'Sign in to the Decentralized Identity Verification Pipeline.',
  version: '1',
  nonceTtlSeconds: 300,
  siweMaxAgeSeconds: 300,
  contractAddress: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
  cookieName: 'divp_session',
};

const nonce: NonceResponse = {
  address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  nonce: 'a1b2c3d4e5f60708',
  expiresAt: '2026-10-08T12:00:00.000Z',
  ttlSeconds: 300,
};

describe('buildSiweMessage', () => {
  it('builds an EIP-4361 shaped message with every required field', () => {
    const now = new Date('2026-10-08T11:55:00.000Z');
    const { message, expirationTime, requestId } = buildSiweMessage({
      config,
      nonce,
      address: nonce.address.toLowerCase(),
      now,
    });

    const lines = message.split('\n');
    expect(lines[0]).toBe('localhost:3000 wants you to sign in with your Ethereum account:');
    expect(lines[1]).toBe('0x70997970C51812dc3A010C7d01b50e0d17dc79C8'); // checksummed
    expect(lines[3]).toBe(config.statement);
    expect(message).toContain('URI: http://localhost:3000');
    expect(message).toContain('Version: 1');
    expect(message).toContain('Chain ID: 1337');
    expect(message).toContain('Nonce: a1b2c3d4e5f60708');
    expect(message).toContain('Issued At: 2026-10-08T11:55:00.000Z');
    expect(message).toContain(`Expiration Time: ${expirationTime}`);
    expect(expirationTime).toBe('2026-10-08T12:00:00.000Z'); // now + ttl (300s)
    expect(message).toContain(`Request ID: ${requestId}`);
    expect(requestId.length).toBeGreaterThan(8);
  });

  it('produces a message whose signature recovers to the signing address', async () => {
    const { Wallet, verifyMessage } = await import('ethers');
    // deterministic key (jsdom's crypto shim is not compatible with createRandom)
    const wallet = new Wallet('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
    const { message } = buildSiweMessage({ config, nonce, address: wallet.address });
    const signature = await wallet.signMessage(message);
    expect(verifyMessage(message, signature)).toBe(wallet.address);
  });
});
