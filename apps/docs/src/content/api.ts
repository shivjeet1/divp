export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface Endpoint {
  id: string;
  method: HttpMethod;
  path: string;
  group: 'Public' | 'SIWE flow' | 'Session' | 'Protected' | 'Admin';
  auth: string;
  summary: string;
  request?: string;
  response?: string;
  errors?: string[];
}

export interface ErrorCode {
  code: string;
  status: number;
  meaning: string;
}

export const ENDPOINTS: Endpoint[] = [
  {
    id: 'auth-config',
    method: 'GET',
    path: '/auth/config',
    group: 'Public',
    auth: 'public',
    summary: 'Security-relevant frontend configuration (chain id, SIWE domain/URI, TTLs).',
    response: `{
  "chainId": 1337,
  "domain": "localhost:3000",
  "uri": "http://localhost:3000",
  "statement": "Sign in to the Decentralized Identity Verification Pipeline.",
  "version": "1",
  "nonceTtlSeconds": 300,
  "siweMaxAgeSeconds": 300,
  "contractAddress": "0x5FbDB2315678f...",
  "cookieName": "divp_session"
}`,
  },
  {
    id: 'health',
    method: 'GET',
    path: '/health',
    group: 'Public',
    auth: 'public',
    summary:
      'Liveness with dependency checks (database, rpc, identityRegistry). 200 when healthy, 503 degraded.',
    response: `{
  "status": "ok",
  "service": "identity-auth-api",
  "chainId": 1337,
  "contractAddress": "0x5FbDB2315678f...",
  "checks": {
    "database": { "ok": true },
    "identityRegistry": { "ok": true },
    "rpc": { "ok": true }
  },
  "timestamp": "2026-10-08T12:00:00.000Z"
}`,
  },
  {
    id: 'nonce',
    method: 'POST',
    path: '/auth/nonce',
    group: 'SIWE flow',
    auth: 'public · rate-limited',
    summary: 'Creates a single-use, wallet-bound nonce (TTL 300 s). Audits NONCE_CREATED.',
    request: `{ "address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }`,
    response: `{
  "address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "nonce": "8f3a2c...",
  "expiresAt": "2026-10-08T12:05:00.000Z",
  "ttlSeconds": 300
}`,
    errors: ['VALIDATION_ERROR (400)', 'INVALID_ADDRESS (400)', 'RATE_LIMITED (429)'],
  },
  {
    id: 'verify',
    method: 'POST',
    path: '/auth/verify',
    group: 'SIWE flow',
    auth: 'public · rate-limited',
    summary:
      'Runs the full pipeline (parse → policy → nonce → recovery → atomic consume → on-chain authorize → session + JWT → Set-Cookie).',
    request: `{
  "message": "localhost:3000 wants you to sign in with your Ethereum account:\\n0x7099...\\n\\nSign in to...\\n\\nURI: http://localhost:3000\\nVersion: 1\\nChain ID: 1337\\nNonce: 8f3a2c...\\nIssued At: ...\\nExpiration Time: ...",
  "signature": "0x..."
}`,
    response: `{
  "authenticated": true,
  "walletAddress": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "role": "USER",
  "jti": "a1b2...",
  "issuedAt": "2026-10-08T12:00:00.000Z",
  "expiresAt": "2026-10-08T13:00:00.000Z"
}`,
    errors: [
      'NONCE_NOT_FOUND / NONCE_ALREADY_USED / NONCE_EXPIRED (401)',
      'SIWE_* (401)',
      'SIGNATURE_INVALID / SIGNATURE_MALFORMED (401)',
      'IDENTITY_NOT_REGISTERED / IDENTITY_INACTIVE (403)',
      'CHAIN_UNAVAILABLE (503)',
    ],
  },
  {
    id: 'register',
    method: 'POST',
    path: '/auth/register',
    group: 'SIWE flow',
    auth: 'public · rate-limited',
    summary:
      'Self-service registration with proof of ownership. Stops before the on-chain authorization step; registers a brand-new wallet as USER (admin-signed write).',
    request: `{ "message": "...EIP-4361 message...", "signature": "0x..." }`,
    response: `{ "registered": true, "walletAddress": "0x7099...", "role": "USER" }`,
    errors: [
      'SIWE_* / SIGNATURE_INVALID (401)',
      'ALREADY_REGISTERED (403) — wallet known (active or revoked)',
      'ADMIN_SIGNER_NOT_CONFIGURED (503)',
      'ADMIN_TX_FAILED (502)',
    ],
  },
  {
    id: 'events',
    method: 'POST',
    path: '/auth/events',
    group: 'SIWE flow',
    auth: 'public · rate-limited',
    summary:
      'Records a client-side MetaMask event for the audit trail (ACCOUNT_CHANGED / CHAIN_CHANGED). No privileges.',
    request: `{ "event": "ACCOUNT_CHANGED", "walletAddress": "0x...", "detail": "MetaMask account changed" }`,
    response: `{ "accepted": true }`,
  },
  {
    id: 'me',
    method: 'GET',
    path: '/auth/me',
    group: 'Session',
    auth: 'session cookie',
    summary:
      'Resolves the current session from the cookie (same shape as /auth/verify, no cookie set).',
    errors: ['AUTH_REQUIRED (401)', 'SESSION_REVOKED / SESSION_EXPIRED (401)'],
  },
  {
    id: 'logout',
    method: 'POST',
    path: '/auth/logout',
    group: 'Session',
    auth: 'session cookie',
    summary: 'Revokes the server-side session row, clears the cookie, audits LOGOUT.',
    response: `{ "success": true, "message": "Session terminated." }`,
  },
  {
    id: 'protected',
    method: 'GET',
    path: '/api/protected',
    group: 'Protected',
    auth: 'any authenticated wallet',
    summary: 'Basic protected resource.',
    response: `{ "authenticated": true, "walletAddress": "0x...", "role": "USER", "jti": "...", "message": "...", "serverTime": "..." }`,
  },
  {
    id: 'protected-operator',
    method: 'GET',
    path: '/api/protected/operator',
    group: 'Protected',
    auth: 'OPERATOR or ADMIN',
    summary: 'Operator-gated resource. Rejects with ROLE_FORBIDDEN (403) otherwise.',
  },
  {
    id: 'protected-admin',
    method: 'GET',
    path: '/api/protected/admin',
    group: 'Protected',
    auth: 'ADMIN',
    summary: 'Admin-gated resource. Rejects with ROLE_FORBIDDEN (403) otherwise.',
  },
  {
    id: 'admin-list',
    method: 'GET',
    path: '/admin/identities',
    group: 'Admin',
    auth: 'ADMIN · view call (no signing key)',
    summary: 'Reads the registry directly. Event history is fetched in block-range chunks.',
    response: `{
  "count": 5,
  "identities": [
    { "walletAddress": "0xf39F...", "registered": true, "active": true, "role": "ADMIN" },
    { "walletAddress": "0x15d3...", "registered": false, "active": false, "role": "NONE" }
  ]
}`,
  },
  {
    id: 'admin-create',
    method: 'POST',
    path: '/admin/identities',
    group: 'Admin',
    auth: 'ADMIN',
    summary: 'Register an identity on-chain (admin-signed). Audits IDENTITY_AUTHORIZED.',
    request: `{ "address": "0x...", "role": "USER" }`,
    response: `{ "created": true }`,
  },
  {
    id: 'admin-patch',
    method: 'PATCH',
    path: '/admin/identities/:address',
    group: 'Admin',
    auth: 'ADMIN',
    summary:
      'Change an identity role (admin-signed) and revoke the wallet’s active Web2 sessions immediately.',
    request: `{ "role": "OPERATOR" }`,
    response: `{ "updated": true }`,
  },
  {
    id: 'admin-revoke',
    method: 'DELETE',
    path: '/admin/identities/:address',
    group: 'Admin',
    auth: 'ADMIN',
    summary:
      'Revoke (inactivate) an identity (admin-signed) and revoke the wallet’s active Web2 sessions immediately.',
    response: `{ "revoked": true }`,
  },
];

export const ERROR_CODES: ErrorCode[] = [
  { code: 'VALIDATION_ERROR', status: 400, meaning: 'Request body failed zod validation' },
  { code: 'INVALID_ADDRESS', status: 400, meaning: 'Address is not valid EIP-55 / missing 0x' },
  {
    code: 'NONCE_NOT_FOUND / NONCE_ALREADY_USED / NONCE_EXPIRED',
    status: 401,
    meaning: 'Nonce unknown / replayed / expired',
  },
  { code: 'SIWE_MALFORMED', status: 401, meaning: 'Message does not parse as EIP-4361' },
  {
    code: 'SIWE_DOMAIN_MISMATCH / SIWE_URI_MISMATCH / SIWE_CHAIN_MISMATCH / SIWE_VERSION_MISMATCH',
    status: 401,
    meaning: 'Message contradicts backend config',
  },
  {
    code: 'SIWE_EXPIRED / SIWE_ISSUED_AT_INVALID / SIWE_NONCE_MISMATCH / SIWE_ADDRESS_MISMATCH',
    status: 401,
    meaning: 'Time / nonce / address binding violations',
  },
  {
    code: 'SIGNATURE_INVALID / SIGNATURE_MALFORMED',
    status: 401,
    meaning: 'ECDSA recovery failed / malformed hex',
  },
  {
    code: 'IDENTITY_NOT_REGISTERED / IDENTITY_INACTIVE / IDENTITY_ROLE_INVALID',
    status: 403,
    meaning: 'On-chain authorization failed',
  },
  {
    code: 'ALREADY_REGISTERED',
    status: 403,
    meaning: 'Self-registration of a wallet already known to the contract (active or revoked)',
  },
  {
    code: 'CHAIN_UNAVAILABLE / CONTRACT_NOT_CONFIGURED',
    status: 503,
    meaning: 'RPC/contract not reachable (controlled degradation)',
  },
  {
    code: 'AUTH_REQUIRED / TOKEN_MISSING / TOKEN_INVALID / TOKEN_EXPIRED / TOKEN_SIGNATURE_INVALID / TOKEN_CLAIM_INVALID',
    status: 401,
    meaning: 'JWT / session token problems',
  },
  {
    code: 'SESSION_NOT_FOUND / SESSION_REVOKED / SESSION_EXPIRED',
    status: 401,
    meaning: 'Server-side session missing / revoked / expired',
  },
  { code: 'ROLE_FORBIDDEN', status: 403, meaning: 'Session valid but role not permitted' },
  {
    code: 'ORIGIN_NOT_ALLOWED',
    status: 403,
    meaning: 'Missing/foreign Origin on a mutating request',
  },
  {
    code: 'RATE_LIMITED',
    status: 429,
    meaning: 'Rate limit exceeded (auth 30/min, general 300/min)',
  },
  {
    code: 'ADMIN_SIGNER_NOT_CONFIGURED',
    status: 503,
    meaning: 'Admin writes disabled (ADMIN_PRIVATE_KEY unset)',
  },
  { code: 'ADMIN_TX_FAILED', status: 502, meaning: 'The admin-signed on-chain write was rejected' },
  { code: 'INTERNAL_ERROR', status: 500, meaning: 'Unexpected error (details never leaked)' },
  { code: 'NOT_FOUND', status: 404, meaning: 'Unknown route' },
];

export const ERROR_SHAPE = `{
  "error": "AUTH_REQUIRED",
  "message": "Authentication is required."
}`;

export const COOKIE_TABLE = {
  name: 'divp_session',
  flags: 'HttpOnly · SameSite=Lax · Path=/ · Max-Age=3600 · Secure (prod only)',
  notes: 'Set by /auth/verify, cleared by /auth/logout',
};
