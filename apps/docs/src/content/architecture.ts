export interface Module {
  module: string;
  responsibility: string;
}

export interface DataTableRow {
  table: string;
  purpose: string;
  constraints: string;
}

export interface ConfigKey {
  key: string;
  purpose: string;
}

export const TRUST_SPLIT = [
  {
    store: 'PostgreSQL',
    holds: 'Lifecycle data — nonces, sessions, audit trail, local wallet metadata.',
    truth: false,
  },
  {
    store: 'IdentityRegistry (on-chain)',
    holds: 'Authorization truth — who is registered, active, and with which role.',
    truth: true,
  },
];

export const CONTRACT_SURFACE: string[] = [
  'register(address, role) / setRole / setActive(bool) — admin-only (onlyAdmin modifier consults the registry itself, with the deployer as initial admin).',
  'getIdentity(address) → (registered, active, role).',
  'hasRole(address, role) — the view used by the backend authorization service.',
  'Events: IdentityRegistered, RoleChanged, ActiveChanged — for auditability.',
  'registerIdentity permits reactivation of an inactive identity, which is why the backend pre-checks getIdentityState and rejects revoked wallets with ALREADY_REGISTERED.',
];

export const BACKEND_MODULES: Module[] = [
  { module: 'config/', responsibility: 'zod-validated env; fail closed on missing/weak config' },
  { module: 'siwe/parser.ts', responsibility: 'strict EIP-4361 parse + policy validation' },
  {
    module: 'services/nonceService.ts',
    responsibility: 'issue / lookup / atomic consume (PostgreSQL)',
  },
  {
    module: 'services/signatureService.ts',
    responsibility: 'recoverSigner + signer↔address assertion',
  },
  {
    module: 'services/authorizationService.ts',
    responsibility: 'on-chain reads via ethers, maps to AppErrors',
  },
  { module: 'services/authService.ts', responsibility: 'the 8-step verify pipeline' },
  {
    module: 'services/registerService.ts',
    responsibility: 'self-registration with ownership proof + ALREADY_REGISTERED guard',
  },
  {
    module: 'services/sessionService.ts',
    responsibility: 'session rows, revoke, verify cookie → claims, revokeAllForWallet',
  },
  { module: 'security/jwt.ts', responsibility: 'manual HS256 sign/verify (Node crypto only)' },
  {
    module: 'middleware/requireAuth.ts',
    responsibility: 'cookie → JWT → session → on-chain re-check → live role gate',
  },
  {
    module: 'middleware/requestContext.ts',
    responsibility: 'request id, IP/UA, Origin check for mutations',
  },
  {
    module: 'middleware/rateLimit.ts',
    responsibility: 'auth/general buckets (express-rate-limit)',
  },
  {
    module: 'middleware/errorHandler.ts',
    responsibility: 'AppError → JSON { error, message }; else generic 500',
  },
  {
    module: 'blockchain/registry.ts',
    responsibility: 'shared provider (cacheTimeout:-1) + contract reads',
  },
  {
    module: 'blockchain/adminRegistry.ts',
    responsibility: 'signed admin txs (fail closed if key unset)',
  },
  { module: 'services/auditService.ts', responsibility: 'best-effort append-only audit rows' },
];

export const DATA_MODEL_TABLE: DataTableRow[] = [
  {
    table: 'Nonce',
    purpose: 'Single-use login challenge',
    constraints: 'value UNIQUE · walletAddress · expiresAt · usedAt',
  },
  {
    table: 'Session',
    purpose: 'Server-side session record',
    constraints: 'jti UNIQUE · walletAddress · expiresAt · revokedAt',
  },
  { table: 'User', purpose: 'Local wallet metadata', constraints: 'walletAddress UNIQUE' },
  {
    table: 'AuditLog',
    purpose: 'Append-only security trail',
    constraints: 'indexes on timestamp, event · never stores secrets',
  },
];

export const SESSION_DESIGN: string[] = [
  'JWT: manual HS256 (createHmac(sha256, secret)); header { alg: HS256, typ: JWT }. Verification pins the algorithm (rejects none, RS256-as-HS256), uses timingSafeEqual, and checks iss/aud/iat/exp/jti.',
  'Cookie: HttpOnly, SameSite=Lax, Path=/, Max-Age=JWT_TTL_SECONDS. Secure is environment-aware — unset/empty resolves to true when NODE_ENV=production.',
  'Server authority: even a perfectly-signed JWT is rejected when its jti session row is missing/revoked/expired. Revoking the session invalidates the token instantly.',
  'CSRF: SameSite=Lax cookies + strict Origin allowlist on every mutating request (ORIGIN_NOT_ALLOWED 403) + a CORS allowlist that never uses *.',
];

export const CONFIG_KEYS: ConfigKey[] = [
  {
    key: 'chainId',
    purpose: 'Must match the running node; recomputed by the backend at verification.',
  },
  {
    key: 'domain / uri / statement / version',
    purpose: 'The exact EIP-4361 fields the server enforces by strict equality.',
  },
  {
    key: 'nonceTtlSeconds / siweMaxAgeSeconds',
    purpose: 'Challenge lifetime and maximum accepted message age.',
  },
  {
    key: 'contractAddress / cookieName',
    purpose: 'Which registry to read and which cookie to issue.',
  },
];
