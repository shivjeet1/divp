export interface SecurityProperty {
  title: string;
  detail: string;
}

export interface Threat {
  id: string;
  category: string;
  title: string;
  threat: string;
  mitigation: string;
}

export interface Attack {
  n: number;
  name: string;
  mechanism: string;
  where: string[];
}

export interface TableRow {
  cells: string[];
}

export const SECURITY_PROPERTIES: SecurityProperty[] = [
  {
    title: 'Single-use nonces',
    detail:
      'Created atomically, bound to a wallet, TTL 300 s, consumed with a conditional UPDATE … WHERE usedAt IS NULL; a replayed signature fails with NONCE_ALREADY_USED.',
  },
  {
    title: 'Strict SIWE (EIP-4361) parsing',
    detail:
      'Domain, URI, version, chain id, Expiration Time (required), issued-at skew and nonce↔address binding are all re-validated by the server against its own config.',
  },
  {
    title: 'On-chain authorization is authoritative',
    detail:
      'Every verification — and, with SESSION_RECHECK_ONCHAIN=true, every authenticated request — reads IdentityRegistry. Revoking a wallet on-chain kills its server session.',
  },
  {
    title: 'Live role enforcement',
    detail:
      'The on-chain role read during the per-request re-check is applied to the request, so a wallet downgraded on-chain (ADMIN→USER) loses the old role on its very next request, not at JWT expiry.',
  },
  {
    title: 'Admin revoke / role-change kills sessions too',
    detail:
      'Both admin actions revoke the wallet’s active Web2 sessions (revokeAllForWallet), so access dies immediately even when SESSION_RECHECK_ONCHAIN=false.',
  },
  {
    title: 'Self-registration cannot bypass revocation',
    detail:
      'POST /auth/register only accepts wallets unknown to the contract; a revoked wallet gets ALREADY_REGISTERED (403) and can only be restored by an admin.',
  },
  {
    title: 'Manual HS256 JWT',
    detail:
      'crypto.createHmac, alg pinned (rejects none and any non-HS256), constant-time signature compare, iss/aud/exp checks, jti bound to a server-side session row.',
  },
  {
    title: 'HttpOnly cookie session',
    detail:
      'SameSite=Lax, Path=/; the Secure flag is on by default in production — an unset/empty COOKIE_SECURE resolves to true when NODE_ENV=production (explicit values always win).',
  },
  {
    title: 'CORS allowlist + Origin/CSRF check',
    detail:
      'Explicit origins with credentials: true and never *; every mutating request must carry an allowed Origin header or is rejected with ORIGIN_NOT_ALLOWED 403.',
  },
  {
    title: 'Rate limiting',
    detail:
      'Auth endpoints 30/min, general 300/min, with structured RATE_LIMITED 429 responses (the test suite raises these so it is not self-throttled).',
  },
  {
    title: 'Structured JSON errors',
    detail:
      'Stable machine-readable codes, safe user-facing messages, no stack traces and no secrets in responses.',
  },
  {
    title: 'Bounded admin reads',
    detail:
      'adminRegistry event listing is fetched in block-range chunks, so registry history never trips RPC log limits or timeouts at scale.',
  },
  {
    title: 'Audit log',
    detail:
      'Append-only AuditLog rows for nonce creation, verification attempts/outcomes, session lifecycle and wallet/network change events.',
  },
];

export const THREATS: Threat[] = [
  {
    id: 'T1',
    category: 'Repudiation / EoP',
    title: 'Signature replay',
    threat:
      'Capture a valid {message, signature} pair and submit it again to mint a second session.',
    mitigation:
      'Every nonce is single-use, wallet-bound and TTL-limited, and consumed atomically after signature verification but before session creation. Zero rows updated → NONCE_ALREADY_USED; two concurrent requests race and exactly one wins.',
  },
  {
    id: 'T2',
    category: 'Spoofing',
    title: 'Expired / stale challenge',
    threat: 'Reuse a signed message long after issuance, or backdate one.',
    mitigation:
      'Server rejects expired nonces (NONCE_EXPIRED), requires an Expiration Time in the future, and bounds Issued At by CLOCK_SKEW_SECONDS=60.',
  },
  {
    id: 'T3',
    category: 'Spoofing',
    title: 'Wrong-wallet signature',
    threat: 'Claim address A but sign with key B, or edit the address after signing.',
    mitigation:
      'The signer is recovered from the exact raw message bytes and must equal both the message address and the nonce-bound wallet. Any byte mutation invalidates the signature (SIGNATURE_INVALID / SIGNATURE_MALFORMED).',
  },
  {
    id: 'T4',
    category: 'Spoofing',
    title: 'Wrong chain / wrong domain (phishing)',
    threat:
      'Trick a user into signing a message minted for another dapp or network, then replay it here.',
    mitigation:
      'Strict server-side equality of domain, URI, Chain ID and Version against backend config. The frontend fetches these values from /auth/config but the backend re-parses the raw message itself and never trusts the rendering.',
  },
  {
    id: 'T5',
    category: 'Elevation of privilege',
    title: 'Unauthorized / revoked identity',
    threat:
      'A wallet that was never registered, or was revoked after login, accesses protected resources.',
    mitigation:
      'The contract is authoritative: authorize() at verify time; per-request re-check revokes live sessions and applies the live role; admin revoke/role-change also revokes sessions server-side; requireRole gates each route.',
  },
  {
    id: 'T6',
    category: 'Tampering',
    title: 'JWT forgery / tampering',
    threat: 'Edit claims (role, sub, exp), forge alg:none, or sign with a guessed secret.',
    mitigation:
      'Hand-rolled HS256 with Node crypto: algorithm pinned to HS256, timingSafeEqual digest compare, iss/aud/exp/iat checked. Even a validly signed token is worthless without its server-side Session row.',
  },
  {
    id: 'T7',
    category: 'Information disclosure / CSRF',
    title: 'Session cookie theft / CSRF',
    threat:
      'A hostile page issues state-changing requests using the victim’s cookie, or script reads the cookie.',
    mitigation:
      'Layered: HttpOnly (JS cannot read it), SameSite=Lax (cross-site POSTs drop it), strict Origin allowlist on mutations (ORIGIN_NOT_ALLOWED 403), CORS allowlist with credentials, and Secure-on-by-default in production.',
  },
  {
    id: 'T8',
    category: 'Denial of service',
    title: 'Rate-limit abuse / nonce flooding',
    threat: 'Spray /auth/nonce to exhaust storage or brute-force; hammer /auth/verify.',
    mitigation:
      'express-rate-limit: auth 30/min, general 300/min, structured RATE_LIMITED 429 responses; nonces expire and are rejected on lookup.',
  },
  {
    id: 'T9',
    category: 'Information disclosure',
    title: 'Cross-origin data theft via misconfigured CORS',
    threat: 'A hostile origin reads authenticated responses.',
    mitigation:
      'Allowlist-only origins, explicit methods/allowedHeaders, maxAge, no wildcard. CORS_ALLOW_NO_ORIGIN exists only for non-browser clients and defaults to false.',
  },
  {
    id: 'T10',
    category: 'Information disclosure',
    title: 'Information leakage',
    threat: 'Stack traces, secrets, SQL or RPC details leak in responses.',
    mitigation:
      'errorHandler maps anything that is not an AppError/ZodError to a generic INTERNAL_ERROR 500; stacks are logged server-side only; audit rows never store secrets.',
  },
  {
    id: 'T11',
    category: 'Session fixation',
    title: 'Account/network switch mid-session',
    threat:
      'Wallet A authenticates, MetaMask switches to wallet B; the UI keeps using A’s session for B.',
    mitigation:
      'useAuth subscribes to accountsChanged/chainChanged: a wallet switch forces POST /auth/logout; a network switch forces re-auth; on reload, /auth/me’s wallet must equal eth_accounts[0].',
  },
  {
    id: 'T12',
    category: 'Elevation of privilege',
    title: 'Admin write abuse',
    threat:
      'Unauthorized on-chain registration/revocation, or a missing admin key lying about state.',
    mitigation:
      '/admin/* requires a valid session AND ADMIN role plus a valid Origin; the contract enforces onlyAdmin on-chain (second line of defense); ADMIN_PRIVATE_KEY unset → writes fail closed with ADMIN_SIGNER_NOT_CONFIGURED 503.',
  },
  {
    id: 'T13',
    category: 'Supply chain',
    title: 'Build hygiene',
    threat: 'Malicious install scripts run during npm install.',
    mitigation:
      'npm 12 lifecycle scripts are blocked by default; only explicitly approved packages run install scripts (the allowScripts list in package.json).',
  },
];

export const ATTACKS: Attack[] = [
  {
    n: 1,
    name: 'Signature replay',
    mechanism:
      'Atomic nonce claim + unique nonce value; replay yields NONCE_ALREADY_USED. Exactly one session from two concurrent verify calls.',
    where: ['Backend ATTACK 1 / 1b', 'Frontend state machine', 'Smoke: replay'],
  },
  {
    n: 2,
    name: 'Expired nonce',
    mechanism: 'A nonce older than NONCE_TTL_SECONDS=300 is rejected; unknown nonces too.',
    where: ['Backend ATTACK 2'],
  },
  {
    n: 3,
    name: 'Wrong wallet',
    mechanism:
      'Recovery over raw bytes must equal the declared address and the nonce-bound address (SIGNATURE_INVALID).',
    where: ['Backend ATTACK 3', 'Smoke: wrong wallet'],
  },
  {
    n: 4,
    name: 'Wrong chain',
    mechanism: 'SIWE message minted for another chain id is rejected (SIWE_CHAIN_MISMATCH).',
    where: ['Backend ATTACK 4', 'Smoke: wrong chain'],
  },
  {
    n: 5,
    name: 'Wrong domain',
    mechanism:
      'Server enforces strict equality against its own SIWE_DOMAIN/SIWE_URI config (SIWE_DOMAIN_MISMATCH / SIWE_URI_MISMATCH).',
    where: ['Backend ATTACK 5 / 5b', 'Smoke: wrong domain'],
  },
  {
    n: 6,
    name: 'Unauthorized wallet',
    mechanism:
      'IdentityRegistry is authoritative; unregistered or inactive wallets get IDENTITY_NOT_REGISTERED/IDENTITY_INACTIVE and no session.',
    where: [
      'Backend ATTACK 6',
      'Frontend blocks unregistered wallet',
      'Smoke: unauthorized wallet',
    ],
  },
  {
    n: 7,
    name: 'Revoked identity',
    mechanism:
      'Authenticate → revoke on-chain → re-auth fails AND the live session dies on its next request (SESSION_REVOKED).',
    where: ['Backend ATTACK 7', 'Smoke logout leg'],
  },
  {
    n: 8,
    name: 'JWT tampering',
    mechanism:
      'HS256 pinned to alg; timingSafeEqual compare; payload edits / wrong secret / alg:none rejected (TOKEN_SIGNATURE_INVALID / TOKEN_INVALID).',
    where: ['Backend jwt.test.ts (15 tests)', 'Backend ATTACK 8 / 8b'],
  },
  {
    n: 9,
    name: 'JWT expiry',
    mechanism:
      'Expired tokens → TOKEN_EXPIRED; expired session rows rejected even with an unexpired signature (SESSION_EXPIRED).',
    where: ['Backend ATTACK 9'],
  },
  {
    n: 10,
    name: 'Wallet/network switch mid-session',
    mechanism:
      'accountsChanged forces logout; chainChanged forces re-auth; reload compares /auth/me wallet against eth_accounts[0].',
    where: ['Frontend useAuth.test.tsx (3 tests)', 'Audit rows ACCOUNT_CHANGED / CHAIN_CHANGED'],
  },
];

export const STRIDE_ROWS: TableRow[] = [
  {
    cells: [
      'Spoofing',
      'ECDSA recovery over raw bytes, nonce↔wallet binding, contract authorization',
    ],
  },
  {
    cells: [
      'Tampering',
      'Strict SIWE field re-validation, HMAC constant-time verify, server-side session rows',
    ],
  },
  {
    cells: [
      'Repudiation',
      'Append-only AuditLog (nonce, verification outcome, session lifecycle, wallet/network changes) with IP/UA',
    ],
  },
  {
    cells: [
      'Information disclosure',
      'HttpOnly cookie, structured errors, no stack/secret leakage, no * CORS',
    ],
  },
  {
    cells: [
      'Denial of service',
      'Rate limiting, 32 kB body limit, nonce TTL, provider timeouts, chunked registry event queries',
    ],
  },
  {
    cells: [
      'Elevation of privilege',
      'On-chain roles authoritative + per-request re-check with live role, requireRole gates, admin-only contract functions',
    ],
  },
];

export const TRADEOFFS: TableRow[] = [
  {
    cells: [
      'COOKIE_SECURE=false in dev',
      'Browsers mishandle Secure over plain http://localhost; set true in prod (see .env.example)',
    ],
  },
  {
    cells: [
      'ADMIN_PRIVATE_KEY is a public test key',
      'Dev-only convenience for the deterministic chain; prod must use a dedicated HSM-backed key',
    ],
  },
  {
    cells: [
      'Test env raises rate limits',
      'vitest.config.ts (NODE_ENV=test) so the suite is not self-throttled; prod limits are 30 / 300 per minute',
    ],
  },
  {
    cells: [
      'Non-browser clients need an explicit Origin on mutations',
      'That header is the CSRF defense; curl tests send it deliberately',
    ],
  },
];

export const RESIDUAL_RISKS: string[] = [
  'JWT_SECRET compromise = forgeable tokens until rotated (server-side session rows still constrain impact; rotation invalidates all sessions). Use a secrets manager in production.',
  'Chain re-orgs / RPC manipulation are out of scope for a single-node dev chain; production would need finality thresholds.',
  'IP/UA in the audit log is personal data — a retention/purge policy is needed under GDPR-like regimes.',
  'No account recovery if a wallet key is lost — inherent to the design.',
  'trust proxy is false: behind a reverse proxy, enable it explicitly or req.ip/rate-limit keys become the proxy’s address.',
  'No CSRF token (SameSite + Origin allowlist chosen instead); if supporting older browsers without SameSite, add a double-submit token.',
];
