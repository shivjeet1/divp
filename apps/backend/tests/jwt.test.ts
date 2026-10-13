import { describe, expect, it } from 'vitest';
import { createHmac } from 'crypto';
import { signJwt, verifyJwt, generateJti, base64url } from '../src/security/jwt';
import { AppError } from '../src/errors/AppError';

const SECRET = 'unit-test-secret-value-that-is-long-enough-0123456789';
const ISSUER = 'identity-auth-server';
const AUDIENCE = 'identity-web-app';

function issue(overrides: { ttlSeconds?: number; iss?: string; aud?: string } = {}) {
  return signJwt(
    {
      sub: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
      role: 'USER',
      iss: overrides.iss ?? ISSUER,
      aud: overrides.aud ?? AUDIENCE,
      ttlSeconds: overrides.ttlSeconds ?? 3600,
    },
    SECRET,
  );
}

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code} but nothing was thrown`);
}

describe('JWT engine (manual HS256 with Node crypto)', () => {
  it('signs a token with the required header shape', () => {
    const { token } = issue();
    const [header] = token.split('.');
    const decoded = JSON.parse(Buffer.from(header, 'base64url').toString());
    expect(decoded).toEqual({ alg: 'HS256', typ: 'JWT' });
  });

  it('issues a token carrying every required claim', () => {
    const { claims } = issue();
    expect(claims).toMatchObject({
      sub: '0x70997970c51812dc3a010c7d01b50e0d17dc79c8',
      role: 'USER',
      iss: ISSUER,
      aud: AUDIENCE,
    });
    expect(typeof claims.iat).toBe('number');
    expect(claims.exp).toBeGreaterThan(claims.iat);
    expect(claims.jti.length).toBeGreaterThanOrEqual(16);
  });

  it('verifies a valid token', () => {
    const { token } = issue();
    const claims = verifyJwt(token, { secret: SECRET, issuer: ISSUER, audience: AUDIENCE });
    expect(claims.role).toBe('USER');
  });

  it('rejects a tampered payload (role -> ADMIN)', () => {
    const { token } = issue();
    const [h, p, s] = token.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    payload.role = 'ADMIN';
    const tampered = `${h}.${base64url(JSON.stringify(payload))}.${s}`;
    expectCode(
      () => verifyJwt(tampered, { secret: SECRET, issuer: ISSUER, audience: AUDIENCE }),
      'TOKEN_SIGNATURE_INVALID',
    );
  });

  it('rejects a tampered signature', () => {
    const { token } = issue();
    const [h, p, s] = token.split('.');
    const flipped = (s[0] === 'A' ? 'B' : 'A') + s.slice(1);
    expectCode(
      () =>
        verifyJwt(`${h}.${p}.${flipped}`, { secret: SECRET, issuer: ISSUER, audience: AUDIENCE }),
      'TOKEN_SIGNATURE_INVALID',
    );
  });

  it('rejects a token signed with a different secret', () => {
    const { token } = issue();
    expectCode(
      () =>
        verifyJwt(token, {
          secret: 'another-secret-another-secret-another-secret',
          issuer: ISSUER,
          audience: AUDIENCE,
        }),
      'TOKEN_SIGNATURE_INVALID',
    );
  });

  it('rejects an expired token', () => {
    const { token } = issue({ ttlSeconds: -60 });
    expectCode(
      () => verifyJwt(token, { secret: SECRET, issuer: ISSUER, audience: AUDIENCE }),
      'TOKEN_EXPIRED',
    );
  });

  it('rejects a token whose iat is in the future relative to verification time', () => {
    const { token } = issue({ ttlSeconds: 3600 });
    // Verifier believes "now" is 2h before the issuance time.
    expectCode(
      () =>
        verifyJwt(token, {
          secret: SECRET,
          issuer: ISSUER,
          audience: AUDIENCE,
          nowSeconds: Math.floor(Date.now() / 1000) - 7200,
          clockSkewSeconds: 0,
        }),
      'TOKEN_CLAIM_INVALID',
    );
  });

  it('rejects the wrong issuer', () => {
    const { token } = issue({ iss: 'evil-issuer' });
    expectCode(
      () => verifyJwt(token, { secret: SECRET, issuer: ISSUER, audience: AUDIENCE }),
      'TOKEN_CLAIM_INVALID',
    );
  });

  it('rejects the wrong audience', () => {
    const { token } = issue({ aud: 'other-app' });
    expectCode(
      () => verifyJwt(token, { secret: SECRET, issuer: ISSUER, audience: AUDIENCE }),
      'TOKEN_CLAIM_INVALID',
    );
  });

  it('rejects a token with a missing required claim', () => {
    const { token } = issue();
    const [h, p] = token.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    delete payload.jti;
    // Re-sign the modified payload with the real secret to isolate the
    // claim-presence check from the signature check.
    const newPayload = base64url(JSON.stringify(payload));
    const signature = base64url(createHmac('sha256', SECRET).update(`${h}.${newPayload}`).digest());
    expect(`${h}.${newPayload}.${signature}`).not.toBe(token);
    expectCode(
      () =>
        verifyJwt(`${h}.${newPayload}.${signature}`, {
          secret: SECRET,
          issuer: ISSUER,
          audience: AUDIENCE,
        }),
      'TOKEN_CLAIM_INVALID',
    );
  });

  it('rejects algorithm "none"', () => {
    const { claims } = issue();
    const header = base64url(JSON.stringify({ alg: 'none', typ: 'JWT' }));
    const payload = base64url(JSON.stringify(claims));
    expectCode(
      () =>
        verifyJwt(`${header}.${payload}.`, { secret: SECRET, issuer: ISSUER, audience: AUDIENCE }),
      'TOKEN_INVALID',
    );
  });

  it('rejects an alg downgrade (HS512 header on HS256 token)', () => {
    const { token } = issue();
    const [, p, s] = token.split('.');
    const header = base64url(JSON.stringify({ alg: 'HS512', typ: 'JWT' }));
    expectCode(
      () =>
        verifyJwt(`${header}.${p}.${s}`, { secret: SECRET, issuer: ISSUER, audience: AUDIENCE }),
      'TOKEN_INVALID',
    );
  });

  it('rejects garbage input', () => {
    for (const bad of [undefined, null, '', 'abc', 'a.b.c', '....', 'x'.repeat(9000)]) {
      expectCode(
        () => verifyJwt(bad, { secret: SECRET, issuer: ISSUER, audience: AUDIENCE }),
        'TOKEN_INVALID',
      );
    }
  });

  it('generates unique JTIs', () => {
    const seen = new Set(Array.from({ length: 500 }, () => generateJti()));
    expect(seen.size).toBe(500);
  });
});
