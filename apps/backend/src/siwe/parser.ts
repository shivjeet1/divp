import { AppError } from '../errors/AppError';

/**
 * EIP-4361 (Sign-In with Ethereum) message parser + validator.
 *
 * The backend never trusts the frontend's construction of this message:
 * the message is re-parsed here and every security-relevant field is
 * validated against server-side configuration before the signature is
 * even considered.
 */

export interface SiweMessage {
  domain: string;
  address: string; // as written in the message
  statement?: string;
  uri: string;
  version: string;
  chainId: number;
  nonce: string;
  issuedAt: string;
  expirationTime?: string;
  notBefore?: string;
  requestId?: string;
  resources?: string[];
  raw: string;
}

const MAX_MESSAGE_LENGTH = 8192;
const HEADER_SUFFIX = ' wants you to sign in with your Ethereum account:';
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const NONCE_RE = /^[A-Za-z0-9_-]{8,64}$/;
const REQUEST_ID_RE = /^[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=-]{1,256}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

function malformed(message: string): AppError {
  return new AppError('SIWE_MALFORMED', 401, message);
}

function parseIsoDate(value: string, field: string): Date {
  if (!ISO_RE.test(value)) throw malformed(`${field} must be an ISO-8601 timestamp.`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw malformed(`${field} is not a valid timestamp.`);
  return date;
}

/**
 * Parses an EIP-4361 message. Strict: unknown fields, out-of-order fields
 * and malformed structure are rejected (nothing is "ignored").
 */
export function parseSiweMessage(raw: unknown): SiweMessage {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw malformed('SIWE message is missing.');
  }
  if (raw.length > MAX_MESSAGE_LENGTH) {
    throw malformed('SIWE message exceeds the maximum allowed length.');
  }
  if (raw.includes('\r')) {
    throw malformed('SIWE message must use LF line endings.');
  }

  const lines = raw.split('\n');
  if (lines.length < 8) throw malformed('SIWE message is incomplete.');

  // --- header -------------------------------------------------------
  const header = lines[0];
  if (!header.endsWith(HEADER_SUFFIX)) {
    throw malformed('SIWE message header is invalid.');
  }
  const domain = header.slice(0, header.length - HEADER_SUFFIX.length);
  if (!domain || /\s/.test(domain)) {
    throw malformed('SIWE domain is invalid.');
  }

  // --- address ------------------------------------------------------
  const address = lines[1];
  if (!ADDRESS_RE.test(address)) {
    throw malformed('SIWE account address is invalid.');
  }
  if (lines[2] !== '') throw malformed('SIWE message structure is invalid after the address.');

  let index = 3;

  // --- optional statement ------------------------------------------
  let statement: string | undefined;
  const lineAt = lines[index];
  if (lineAt !== undefined && lineAt !== '' && !lineAt.startsWith('URI: ')) {
    statement = lineAt;
    if (statement.length > 512) throw malformed('SIWE statement is too long.');
    index += 1;
    if (lines[index] !== '') throw malformed('SIWE statement must be followed by an empty line.');
    index += 1;
  } else if (lineAt === '') {
    // Tolerate the "extra blank line" form when no statement is present.
    index += 1;
  }

  // --- ordered fields ------------------------------------------------
  const takeField = (name: string, required: boolean): string | undefined => {
    const line = lines[index];
    if (line === undefined || line === '') {
      if (required) throw malformed(`SIWE message is missing the required field: ${name}.`);
      return undefined;
    }
    const prefix = `${name}: `;
    if (!line.startsWith(prefix)) {
      if (!required) return undefined; // optional field simply omitted
      throw malformed(
        `SIWE message fields are missing, out of order or unknown (expected ${name}).`,
      );
    }
    const value = line.slice(prefix.length);
    if (value.length === 0) throw malformed(`SIWE field ${name} is empty.`);
    index += 1;
    return value;
  };

  const uri = takeField('URI', true)!;
  const version = takeField('Version', true)!;
  const chainIdRaw = takeField('Chain ID', true)!;
  const nonce = takeField('Nonce', true)!;
  const issuedAt = takeField('Issued At', true)!;
  const expirationTime = takeField('Expiration Time', false);
  const notBefore = takeField('Not Before', false);
  const requestId = takeField('Request ID', false);

  if (version !== '1') throw malformed('SIWE message version must be 1.');
  if (!/^\d{1,10}$/.test(chainIdRaw)) throw malformed('SIWE Chain ID must be a positive integer.');
  const chainId = Number(chainIdRaw);
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw malformed('SIWE Chain ID is invalid.');
  if (!NONCE_RE.test(nonce)) throw malformed('SIWE nonce format is invalid.');
  parseIsoDate(issuedAt, 'Issued At');
  if (expirationTime) parseIsoDate(expirationTime, 'Expiration Time');
  if (notBefore) parseIsoDate(notBefore, 'Not Before');
  if (requestId && !REQUEST_ID_RE.test(requestId)) throw malformed('SIWE Request ID is invalid.');

  // --- optional resources --------------------------------------------
  let resources: string[] | undefined;
  if (lines[index] === 'Resources:') {
    index += 1;
    resources = [];
    while (index < lines.length && lines[index].startsWith('- ')) {
      const resource = lines[index].slice(2);
      try {
        new URL(resource);
      } catch {
        throw malformed('SIWE resources must be valid URIs.');
      }
      resources.push(resource);
      index += 1;
    }
    if (resources.length === 0) throw malformed('SIWE Resources block must list at least one URI.');
  }

  if (index !== lines.length) {
    throw malformed('SIWE message contains unexpected trailing content.');
  }

  try {
    new URL(uri);
  } catch {
    throw malformed('SIWE URI must be a valid absolute URI.');
  }

  return {
    domain,
    address,
    statement,
    uri,
    version,
    chainId,
    nonce,
    issuedAt,
    expirationTime,
    notBefore,
    requestId,
    resources,
    raw,
  };
}

export interface SiwePolicy {
  domain: string;
  uri: string;
  chainId: number;
  maxAgeSeconds: number;
  clockSkewSeconds: number;
  requireExpiration: boolean;
}

/**
 * Validates the security-critical fields of a parsed message against
 * server-side policy. Throws AppError on the first violation - callers
 * must stop the authentication pipeline immediately.
 */
export function validateSiwePolicy(msg: SiweMessage, policy: SiwePolicy, now = Date.now()): void {
  // Domain binding (SEC-02) - prevents cross-domain replay.
  if (msg.domain !== policy.domain) {
    throw new AppError(
      'SIWE_DOMAIN_MISMATCH',
      401,
      'SIWE message domain does not match this application.',
    );
  }

  // URI binding - prevents phishing-site message reuse.
  if (msg.uri !== policy.uri) {
    throw new AppError(
      'SIWE_URI_MISMATCH',
      401,
      'SIWE message URI does not match this application.',
    );
  }

  // Chain binding (SEC-03) - prevents cross-chain replay.
  if (msg.chainId !== policy.chainId) {
    throw new AppError(
      'SIWE_CHAIN_MISMATCH',
      401,
      'SIWE message chain ID does not match the configured network.',
    );
  }

  const issuedAt = new Date(msg.issuedAt).getTime();
  const skewMs = policy.clockSkewSeconds * 1000;

  // Issued-at sanity: not in the future beyond skew, not older than max age.
  if (issuedAt > now + skewMs) {
    throw new AppError('SIWE_ISSUED_AT_INVALID', 401, 'SIWE message was issued in the future.');
  }
  if (now - issuedAt > policy.maxAgeSeconds * 1000 + skewMs) {
    throw new AppError('SIWE_EXPIRED', 401, 'SIWE message is too old to be accepted.');
  }

  // Expiration (SEC-04).
  if (policy.requireExpiration && !msg.expirationTime) {
    throw new AppError('SIWE_EXPIRED', 401, 'SIWE message must carry an expiration time.');
  }
  if (msg.expirationTime) {
    const expiresAt = new Date(msg.expirationTime).getTime();
    if (Number.isNaN(expiresAt)) {
      throw new AppError('SIWE_EXPIRED', 401, 'SIWE message expiration time is invalid.');
    }
    if (now >= expiresAt) {
      throw new AppError('SIWE_EXPIRED', 401, 'SIWE message has expired.');
    }
    // Guard against absurd lifetimes even when not yet expired.
    if (expiresAt - issuedAt > policy.maxAgeSeconds * 1000 + skewMs) {
      throw new AppError('SIWE_EXPIRED', 401, 'SIWE message lifetime exceeds the allowed maximum.');
    }
  }
  if (msg.notBefore) {
    const nbf = new Date(msg.notBefore).getTime();
    if (now + skewMs < nbf) {
      throw new AppError('SIWE_ISSUED_AT_INVALID', 401, 'SIWE message is not valid yet.');
    }
  }
}
