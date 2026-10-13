import { describe, expect, it } from 'vitest';
import { parseSiweMessage, validateSiwePolicy, type SiwePolicy } from '../src/siwe/parser';
import { AppError } from '../src/errors/AppError';

const POLICY: SiwePolicy = {
  domain: 'localhost:3000',
  uri: 'http://localhost:3000',
  chainId: 1337,
  maxAgeSeconds: 300,
  clockSkewSeconds: 60,
  requireExpiration: true,
};

function message(overrides: Partial<Record<string, string | undefined>> = {}): string {
  const lines = [
    `${overrides.domain ?? POLICY.domain} wants you to sign in with your Ethereum account:`,
    overrides.address ?? '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    '',
    'Sign in to the Decentralized Identity Verification Pipeline.',
    '',
    `URI: ${overrides.uri ?? POLICY.uri}`,
    'Version: 1',
    `Chain ID: ${overrides.chainId ?? POLICY.chainId}`,
    `Nonce: ${overrides.nonce ?? 'test-nonce-1234567890'}`,
    `Issued At: ${overrides.issuedAt ?? new Date().toISOString()}`,
  ];
  if (overrides.omitExpiration !== 'true') {
    lines.push(
      `Expiration Time: ${overrides.expirationTime ?? new Date(Date.now() + 300000).toISOString()}`,
    );
  }
  if (overrides.requestId !== undefined) lines.push(`Request ID: ${overrides.requestId}`);
  return lines.join('\n');
}

function expectCode(fn: () => unknown, code: string): AppError {
  try {
    fn();
  } catch (error) {
    expect(error, `expected AppError, got ${String(error)}`).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return error as AppError;
  }
  throw new Error(`Expected error code ${code} but nothing was thrown`);
}

describe('SIWE (EIP-4361) parsing', () => {
  it('parses a valid message', () => {
    const parsed = parseSiweMessage(message());
    expect(parsed.domain).toBe('localhost:3000');
    expect(parsed.chainId).toBe(1337);
    expect(parsed.nonce).toBe('test-nonce-1234567890');
    expect(parsed.version).toBe('1');
    expect(parsed.expirationTime).toBeTruthy();
    expect(parsed.requestId).toBeUndefined();
  });

  it('parses a message with Request ID and no statement', () => {
    const lines = message().split('\n');
    // remove statement + its blank line
    const withoutStatement = [lines[0], lines[1], '', ...lines.slice(4)];
    const parsed = parseSiweMessage(withoutStatement.join('\n'));
    expect(parsed.statement).toBeUndefined();
  });

  it('parses optional resources', () => {
    const withResources = `${message()}\nResources:\n- http://localhost:3000/doc1`;
    const parsed = parseSiweMessage(withResources);
    expect(parsed.resources).toEqual(['http://localhost:3000/doc1']);
  });

  it('rejects malformed messages', () => {
    expectCode(() => parseSiweMessage(''), 'SIWE_MALFORMED');
    expectCode(() => parseSiweMessage(null), 'SIWE_MALFORMED');
    expectCode(() => parseSiweMessage(42 as unknown as string), 'SIWE_MALFORMED');
    expectCode(() => parseSiweMessage(message({ domain: 'evil domain' })), 'SIWE_MALFORMED');
    expectCode(() => parseSiweMessage(message({ address: '0x123' })), 'SIWE_MALFORMED');
    expectCode(() => parseSiweMessage('random text\nnot a siwe message'), 'SIWE_MALFORMED');
  });

  it('rejects unknown / out-of-order fields', () => {
    const smuggled = message().replace('Version: 1', 'Bogus: 1\nVersion: 1');
    expectCode(() => parseSiweMessage(smuggled), 'SIWE_MALFORMED');

    const swapped = message()
      .replace('Version: 1', 'TMP: x')
      .replace('Chain ID: 1337', 'Version: 1')
      .replace('Nonce: test-nonce-1234567890', 'Chain ID: 1337')
      .replace(/Issued At: .*$/, 'Nonce: test-nonce-1234567890');
    // Issued At now missing -> malformed
    expectCode(() => parseSiweMessage(swapped), 'SIWE_MALFORMED');
  });

  it('rejects trailing content', () => {
    expectCode(() => parseSiweMessage(`${message()}\nextra`), 'SIWE_MALFORMED');
  });

  it('rejects an invalid version', () => {
    expectCode(
      () => parseSiweMessage(message({}).replace('Version: 1', 'Version: 2')),
      'SIWE_MALFORMED',
    );
  });

  it('rejects a non-integer chain id', () => {
    expectCode(
      () => parseSiweMessage(message({}).replace('Chain ID: 1337', 'Chain ID: 13.37')),
      'SIWE_MALFORMED',
    );
  });
});

describe('SIWE policy validation (server-side trust decisions)', () => {
  const valid = () => parseSiweMessage(message());

  it('accepts a compliant message', () => {
    expect(() => validateSiwePolicy(valid(), POLICY)).not.toThrow();
  });

  it('rejects a foreign domain (cross-domain replay)', () => {
    const msg = parseSiweMessage(message({ domain: 'evil.example' }));
    expectCode(() => validateSiwePolicy(msg, POLICY), 'SIWE_DOMAIN_MISMATCH');
  });

  it('rejects a foreign URI', () => {
    const msg = parseSiweMessage(message({ uri: 'https://evil.example/login' }));
    expectCode(() => validateSiwePolicy(msg, POLICY), 'SIWE_URI_MISMATCH');
  });

  it('rejects the wrong chain id (cross-chain replay)', () => {
    const msg = parseSiweMessage(message({ chainId: '1' }));
    expectCode(() => validateSiwePolicy(msg, POLICY), 'SIWE_CHAIN_MISMATCH');
  });

  it('rejects an expired message', () => {
    const msg = parseSiweMessage(
      message({
        issuedAt: new Date(Date.now() - 120000).toISOString(),
        expirationTime: new Date(Date.now() - 60000).toISOString(),
      }),
    );
    expectCode(() => validateSiwePolicy(msg, POLICY), 'SIWE_EXPIRED');
  });

  it('rejects a message older than max age', () => {
    const msg = parseSiweMessage(
      message({
        issuedAt: new Date(Date.now() - 3600000).toISOString(),
        expirationTime: new Date(Date.now() + 3600000).toISOString(),
      }),
    );
    expectCode(() => validateSiwePolicy(msg, POLICY), 'SIWE_EXPIRED');
  });

  it('rejects a missing expiration when policy requires it', () => {
    const msg = parseSiweMessage(message({ omitExpiration: 'true' }));
    expectCode(() => validateSiwePolicy(msg, POLICY), 'SIWE_EXPIRED');
  });

  it('rejects an issued-at in the future beyond skew', () => {
    const msg = parseSiweMessage(
      message({
        issuedAt: new Date(Date.now() + 600000).toISOString(),
        expirationTime: new Date(Date.now() + 900000).toISOString(),
      }),
    );
    expectCode(() => validateSiwePolicy(msg, POLICY), 'SIWE_ISSUED_AT_INVALID');
  });

  it('rejects a lifetime longer than the allowed maximum', () => {
    const msg = parseSiweMessage(
      message({
        issuedAt: new Date(Date.now() - 10000).toISOString(),
        expirationTime: new Date(Date.now() + 86400000).toISOString(),
      }),
    );
    expectCode(() => validateSiwePolicy(msg, POLICY), 'SIWE_EXPIRED');
  });

  it('accepts a message issued seconds in the future (within skew)', () => {
    const msg = parseSiweMessage(
      message({
        issuedAt: new Date(Date.now() + 30000).toISOString(),
        expirationTime: new Date(Date.now() + 300000).toISOString(),
      }),
    );
    expect(() => validateSiwePolicy(msg, POLICY)).not.toThrow();
  });
});
