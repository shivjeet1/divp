export type Actor = 'client' | 'backend' | 'database' | 'chain';

export interface PipelineStep {
  id: string;
  n: number;
  title: string;
  actor: Actor;
  protocol: string;
  summary: string;
  detail: string;
  checks?: string[];
  code?: string;
  failure?: { code: string; status: number };
}

export const ACTOR_LABEL: Record<Actor, string> = {
  client: 'Browser / wallet',
  backend: 'Express backend',
  database: 'PostgreSQL',
  chain: 'IdentityRegistry',
};

/**
 * The end-to-end authentication pipeline: GET /auth/config → wallet connect →
 * nonce → SIWE signature → server verification → on-chain authorization →
 * session cookie → protected request → logout.
 */
export const PIPELINE_STEPS: PipelineStep[] = [
  {
    id: 'config',
    n: 1,
    title: 'Learn the security config',
    actor: 'client',
    protocol: 'GET /auth/config',
    summary:
      'The frontend fetches chainId, the SIWE domain/URI, TTLs and the cookie name from the backend. Nothing security-critical is hardcoded.',
    detail:
      'The endpoint is a convenience, not a trust source: the backend independently re-validates every one of these values when it verifies the signature. If the RPC is unreachable the call degrades in a controlled way.',
    code: `{
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
    failure: { code: 'CHAIN_UNAVAILABLE', status: 503 },
  },
  {
    id: 'connect',
    n: 2,
    title: 'Connect the wallet',
    actor: 'client',
    protocol: 'EIP-1193 · eth_requestAccounts / eth_chainId',
    summary:
      'MetaMask exposes the account and chain. A chain mismatch moves the UI to wrong_network and blocks sign-in.',
    detail:
      'No key material ever leaves the wallet — the app only ever sees the address. The connected chain id must equal the configured one before signing is allowed.',
    checks: ['chainId === config.chainId', 'address is valid EIP-55 checksum'],
  },
  {
    id: 'nonce',
    n: 3,
    title: 'Request a single-use nonce',
    actor: 'backend',
    protocol: 'POST /auth/nonce { address }',
    summary:
      'A single-use, wallet-bound nonce is created with a 300 s TTL and an audit row is written (NONCE_CREATED).',
    detail:
      'Nonces are unique and bound to the requesting wallet, so a nonce issued for wallet A can never be consumed by wallet B. Exactly one signature can ever consume it.',
    code: `// request
{ "address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" }

// response 200
{
  "address": "0x7099...79C8",
  "nonce": "8f3a2c...",
  "expiresAt": "2026-10-08T12:05:00.000Z",
  "ttlSeconds": 300
}`,
    failure: { code: 'RATE_LIMITED', status: 429 },
  },
  {
    id: 'sign',
    n: 4,
    title: 'Sign the EIP-4361 message',
    actor: 'client',
    protocol: 'EIP-4361 · personal_sign',
    summary:
      'The wallet signs the SIWE message built from the server config. The private key never leaves MetaMask.',
    detail:
      'The exact raw message bytes are what gets verified server-side — flipping any single byte (address, chain, nonce) invalidates the signature.',
    code: `localhost:3000 wants you to sign in with your Ethereum account:
0x70997970C51812dc3A010C7d01b50e0d17dc79C8

Sign in to the Decentralized Identity Verification Pipeline.

URI: http://localhost:3000
Version: 1
Chain ID: 1337
Nonce: 8f3a2c...
Issued At: 2026-10-08T12:00:00.000Z
Expiration Time: 2026-10-08T12:05:00.000Z`,
  },
  {
    id: 'parse',
    n: 5,
    title: 'Parse strictly (EIP-4361)',
    actor: 'backend',
    protocol: 'POST /auth/verify · siwe/parser',
    summary:
      'The server re-parses the raw message itself against a strict EIP-4361 grammar — it never trusts the frontend rendering.',
    detail:
      'Malformed or foreign fields stop the pipeline immediately and an audit row records the reason code.',
    failure: { code: 'SIWE_MALFORMED', status: 401 },
  },
  {
    id: 'policy',
    n: 6,
    title: 'Enforce the SIWE policy',
    actor: 'backend',
    protocol: 'policy validation',
    summary:
      'domain, URI, Chain ID and Version must equal backend config; Expiration Time is required and must be in the future; Issued At is bounded by clock skew.',
    detail:
      'This is the anti-phishing layer: a message minted for another dapp, URI or network can never be replayed here.',
    checks: [
      'domain === SIWE_DOMAIN',
      'uri === SIWE_URI',
      'chainId === CHAIN_ID',
      'version === 1',
      'expirationTime in the future',
      '|now - issuedAt| <= CLOCK_SKEW_SECONDS (60)',
    ],
    failure: { code: 'SIWE_DOMAIN_MISMATCH / SIWE_CHAIN_MISMATCH / SIWE_EXPIRED', status: 401 },
  },
  {
    id: 'nonce-consume',
    n: 7,
    title: 'Consume the nonce (atomic)',
    actor: 'database',
    protocol: 'UPDATE … WHERE usedAt IS NULL',
    summary:
      'A conditional UPDATE claims the nonce exactly once — after signature verification, before session creation.',
    detail:
      'Two concurrent identical verify calls race on the same row and exactly one wins (proved by ATTACK 1b in the backend suite). No path can mint a session without consuming a nonce, which is what makes replay impossible.',
    code: `UPDATE "Nonce"
   SET "usedAt" = now()
 WHERE value = $1
   AND "usedAt" IS NULL;
-- 0 rows updated -> NONCE_ALREADY_USED`,
    failure: { code: 'NONCE_ALREADY_USED / NONCE_EXPIRED / NONCE_NOT_FOUND', status: 401 },
  },
  {
    id: 'recover',
    n: 8,
    title: 'Recover the signer',
    actor: 'backend',
    protocol: 'ECDSA recovery over raw bytes',
    summary:
      'The signer is recovered from the exact raw message bytes and must equal both the message address and the nonce-bound wallet.',
    detail:
      'Identity substitution (claim A, sign with B, or edit the address after signing) fails here.',
    checks: [
      'recoverSigner(raw, signature) === message.address',
      'message.address === nonce.walletAddress',
    ],
    failure: { code: 'SIGNATURE_INVALID / SIGNATURE_MALFORMED', status: 401 },
  },
  {
    id: 'authorize',
    n: 9,
    title: 'Authorize on-chain',
    actor: 'chain',
    protocol: 'IdentityRegistry.authorize(address)',
    summary:
      'The contract is the source of truth: a registered, active identity resolves to its role (USER / OPERATOR / ADMIN).',
    detail:
      'Roles always come from the chain, never from the client. An unregistered or revoked wallet gets no session. If the RPC is down the backend degrades in a controlled way rather than guessing.',
    failure: {
      code: 'IDENTITY_NOT_REGISTERED / IDENTITY_INACTIVE / CHAIN_UNAVAILABLE',
      status: 403,
    },
  },
  {
    id: 'session',
    n: 10,
    title: 'Create the session + JWT',
    actor: 'backend',
    protocol: 'HS256 JWT → Set-Cookie',
    summary:
      'Upsert the User row, create a Session row (jti), sign a manual HS256 JWT, and set divp_session (HttpOnly, SameSite=Lax).',
    detail:
      'Even a perfectly signed token is worthless without its server-side Session row, so revocation is instant and a leaked signing key cannot outlive a revoked session.',
    code: `// JWT payload
{ "sub": "0x7099...", "role": "USER", "iss": "...", "aud": "...",
  "iat": 1759924800, "exp": 1759928400, "jti": "a1b2..." }

// response header
Set-Cookie: divp_session=...; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`,
  },
  {
    id: 'protected',
    n: 11,
    title: 'Call a protected resource',
    actor: 'backend',
    protocol: 'GET /api/protected · requireAuth()',
    summary:
      'The cookie is verified (HS256) → the Session row is checked → the identity is re-checked on-chain and the live role is applied.',
    detail:
      'Because the on-chain re-check supplies the live role, a wallet downgraded on-chain loses the old role on its very next request — the stale role inside the JWT is never used for authorization.',
    checks: [
      'cookie signature valid & not expired',
      'session row exists, not revoked, not expired',
      'identity still active on-chain (SESSION_RECHECK_ONCHAIN)',
      'role satisfies the route gate',
    ],
    failure: { code: 'AUTH_REQUIRED / SESSION_REVOKED / ROLE_FORBIDDEN', status: 401 },
  },
  {
    id: 'logout',
    n: 12,
    title: 'Log out',
    actor: 'backend',
    protocol: 'POST /auth/logout',
    summary:
      'The Session row is revoked server-side and the cookie is cleared. The old cookie and wallet are then rejected with SESSION_REVOKED.',
    detail:
      'Admin revoke and role-change reuse the same mechanism (revokeAllForWallet), so on-chain changes kill existing sessions immediately even when the per-request re-check is disabled.',
    code: `{ "success": true, "message": "Session terminated." }`,
  },
];
