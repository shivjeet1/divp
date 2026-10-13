import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { AppError } from '../errors/AppError';

/**
 * Hand-rolled JWT (JWS) implementation using HS256 / HMAC-SHA256 with
 * Node.js native crypto - required by the project specification.
 *
 * Construction:
 *   base64url(header) "." base64url(payload) "." base64url(HMAC-SHA256(secret, signingInput))
 *
 * Verification rejects: malformed tokens, non-HS256 algorithms (incl. "none"),
 * signature tampering (constant-time compare), payload tampering, wrong
 * issuer/audience, missing claims, bad timestamps and expiration.
 */

export const JWT_ALGORITHM = 'HS256';

export interface JwtClaims {
  sub: string; // wallet address (lower-case)
  role: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
  jti: string;
}

export interface JwtHeader {
  alg: string;
  typ: string;
}

const B64URL_RE = /^[A-Za-z0-9_-]+$/;

export function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function generateJti(): string {
  return randomBytes(16).toString('base64url');
}

function hmac(secret: string, signingInput: string): Buffer {
  return createHmac('sha256', secret).update(signingInput, 'utf8').digest();
}

/** Creates a signed HS256 JWT. */
export function signJwt(
  claims: Omit<JwtClaims, 'iat' | 'exp' | 'jti'> & { jti?: string; ttlSeconds: number },
  secret: string,
): { token: string; claims: JwtClaims } {
  const nowSec = Math.floor(Date.now() / 1000);
  const jti = claims.jti ?? generateJti();

  const header: JwtHeader = { alg: JWT_ALGORITHM, typ: 'JWT' };
  const payload: JwtClaims = {
    sub: claims.sub,
    role: claims.role,
    iss: claims.iss,
    aud: claims.aud,
    iat: nowSec,
    exp: nowSec + claims.ttlSeconds,
    jti,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = base64url(hmac(secret, signingInput));

  return { token: `${signingInput}.${signature}`, claims: payload };
}

export interface VerifyOptions {
  secret: string;
  issuer: string;
  audience: string;
  clockSkewSeconds?: number;
  nowSeconds?: number;
}

function decodeSegment(segment: string, label: string): unknown {
  if (!B64URL_RE.test(segment)) {
    throw new AppError('TOKEN_INVALID', 401, `JWT ${label} is not valid base64url.`);
  }
  let json: string;
  try {
    json = Buffer.from(segment, 'base64url').toString('utf8');
  } catch {
    throw new AppError('TOKEN_INVALID', 401, `JWT ${label} could not be decoded.`);
  }
  try {
    return JSON.parse(json);
  } catch {
    throw new AppError('TOKEN_INVALID', 401, `JWT ${label} is not valid JSON.`);
  }
}

/** Verifies a JWT and returns its validated claims. Throws AppError otherwise. */
export function verifyJwt(token: unknown, options: VerifyOptions): JwtClaims {
  const { secret, issuer, audience, clockSkewSeconds = 0 } = options;
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);

  if (typeof token !== 'string' || token.length === 0 || token.length > 8192) {
    throw new AppError('TOKEN_INVALID', 401, 'Session token is missing or malformed.');
  }

  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
    throw new AppError('TOKEN_INVALID', 401, 'Session token must have three non-empty segments.');
  }
  const [encodedHeader, encodedPayload, encodedSignature] = parts;

  // --- header: algorithm confusion is rejected ------------------------
  const header = decodeSegment(encodedHeader, 'header') as Partial<JwtHeader>;
  if (!header || typeof header !== 'object' || Array.isArray(header)) {
    throw new AppError('TOKEN_INVALID', 401, 'JWT header is invalid.');
  }
  if (header.alg !== JWT_ALGORITHM) {
    throw new AppError('TOKEN_INVALID', 401, 'JWT algorithm must be HS256.');
  }
  if (header.typ !== undefined && header.typ !== 'JWT') {
    throw new AppError('TOKEN_INVALID', 401, 'JWT type must be JWT.');
  }

  // --- signature: constant-time comparison ----------------------------
  if (!B64URL_RE.test(encodedSignature)) {
    throw new AppError('TOKEN_INVALID', 401, 'JWT signature is not valid base64url.');
  }
  const expected = hmac(secret, `${encodedHeader}.${encodedPayload}`);
  const provided = Buffer.from(encodedSignature, 'base64url');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new AppError('TOKEN_SIGNATURE_INVALID', 401, 'JWT signature verification failed.');
  }

  // --- payload: only now trusted enough to parse deeply ---------------
  const payload = decodeSegment(encodedPayload, 'payload') as Partial<JwtClaims>;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError('TOKEN_INVALID', 401, 'JWT payload is invalid.');
  }

  const required: Array<keyof JwtClaims> = ['sub', 'role', 'iss', 'aud', 'iat', 'exp', 'jti'];
  for (const key of required) {
    if (payload[key] === undefined || payload[key] === null) {
      throw new AppError('TOKEN_CLAIM_INVALID', 401, `JWT is missing the required claim: ${key}.`);
    }
  }
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new AppError('TOKEN_CLAIM_INVALID', 401, 'JWT sub claim is invalid.');
  }
  if (typeof payload.role !== 'string' || !['USER', 'OPERATOR', 'ADMIN'].includes(payload.role)) {
    throw new AppError('TOKEN_CLAIM_INVALID', 401, 'JWT role claim is invalid.');
  }
  if (payload.iss !== issuer) {
    throw new AppError('TOKEN_CLAIM_INVALID', 401, 'JWT issuer is invalid.');
  }
  const audValue: unknown = payload.aud;
  const audOk =
    typeof audValue === 'string'
      ? audValue === audience
      : Array.isArray(audValue) && audValue.includes(audience);
  if (!audOk) {
    throw new AppError('TOKEN_CLAIM_INVALID', 401, 'JWT audience is invalid.');
  }
  if (typeof payload.iat !== 'number' || !Number.isInteger(payload.iat)) {
    throw new AppError('TOKEN_CLAIM_INVALID', 401, 'JWT iat claim is invalid.');
  }
  if (typeof payload.exp !== 'number' || !Number.isInteger(payload.exp)) {
    throw new AppError('TOKEN_CLAIM_INVALID', 401, 'JWT exp claim is invalid.');
  }
  if (typeof payload.jti !== 'string' || payload.jti.length === 0) {
    throw new AppError('TOKEN_CLAIM_INVALID', 401, 'JWT jti claim is invalid.');
  }

  // --- timestamps ------------------------------------------------------
  if (payload.iat > now + clockSkewSeconds) {
    throw new AppError('TOKEN_CLAIM_INVALID', 401, 'JWT was issued in the future.');
  }
  if (now >= payload.exp) {
    throw new AppError('TOKEN_EXPIRED', 401, 'Session has expired. Please sign in again.');
  }

  return payload as JwtClaims;
}
