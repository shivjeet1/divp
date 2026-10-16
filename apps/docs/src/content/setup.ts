export interface CodeStep {
  title: string;
  note?: string;
  code: string;
}

export interface TableRowLike {
  cells: string[];
}

export const PREREQUISITES: string[] = [
  'Node.js ≥ 20',
  'Docker (for PostgreSQL 16) — or any reachable PostgreSQL',
  'npm ≥ 12 (lifecycle scripts are blocked by default and must be approved once)',
];

export const QUICKSTART: CodeStep[] = [
  {
    title: '1 · Install',
    note: 'npm 12 blocks lifecycle scripts; approve them once after install.',
    code: `npm install
npm install-scripts approve --all`,
  },
  {
    title: '2 · Environment',
    note: 'Creates .env with a random JWT_SECRET, ADMIN_PRIVATE_KEY and contract address slot.',
    code: `npm run setup:env`,
  },
  {
    title: '3 · Database',
    code: `docker compose up -d          # postgres:16-alpine, healthcheck 'healthy'
npm run db:migrate`,
  },
  {
    title: '4 · Contract (one-time)',
    code: `npm run compile
npm run test:contracts        # 26/26
npm run deploy:contract       # writes .env + contracts/deployment.json
npm run seed:identities       # USER / OPERATOR / ADMIN / revoked wallets`,
  },
  {
    title: '5 · Run everything',
    note: 'In dev, start.sh also brings up Ganache and bootstraps a fresh chain if needed.',
    code: `./start.sh                    # Ganache + backend :4000 + frontend :3000
./start.sh --prod             # build once, then serve compiled bundles

# the docs portal (this site) runs separately:
npm run dev:docs              # -> http://localhost:5173`,
  },
];

export const SEEDED_ACCOUNTS: TableRowLike[] = [
  { cells: ['0', '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266', 'ADMIN (deployer)'] },
  { cells: ['1', '0x70997970C51812dc3A010C7d01b50e0d17dc79C8', 'USER'] },
  { cells: ['2', '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', 'OPERATOR'] },
  { cells: ['3', '0x90F79bf6EB2c4f870365E785982E1f101E93b906', 'ADMIN'] },
  { cells: ['4', '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65', 'unregistered (attack demos)'] },
];

export const SEED_MNEMONIC = 'test test test test test test test test test test test junk';

export const COMMANDS: TableRowLike[] = [
  { cells: ['npm run setup:env', 'Generate .env from .env.example with a random JWT_SECRET'] },
  { cells: ['npm run chain', 'Ganache in the foreground (deterministic mnemonic)'] },
  {
    cells: [
      'npm run compile / test:contracts / deploy:contract / seed:identities',
      'Contract lifecycle',
    ],
  },
  { cells: ['npm run db:migrate / db:studio', 'Prisma migrations / inspector'] },
  { cells: ['npm run dev:backend / dev:frontend / dev:docs', 'Dev servers (4000 / 3000 / 5173)'] },
  {
    cells: [
      './start.sh / ./start.sh --prod',
      'All app servers together (dev, or build + prod serve)',
    ],
  },
  { cells: ['npm run build:backend / build:frontend / build:docs', 'Production builds'] },
  { cells: ['npm run test', 'contracts + backend + frontend + docs suites'] },
  { cells: ['npm run smoke', 'Live end-to-end attack demo against a running backend'] },
  { cells: ['npm run test:e2e', 'Playwright browser E2E (starts against :3000)'] },
  { cells: ['npm run lint / format:check', 'ESLint (both apps) / Prettier'] },
];

export interface EnvVar {
  key: string;
  purpose: string;
  secret?: boolean;
}

export const ENV_VARS: EnvVar[] = [
  {
    key: 'NODE_ENV',
    purpose: 'development | production | test. Drives the environment-aware COOKIE_SECURE default.',
  },
  {
    key: 'FRONTEND_URL / BACKEND_URL',
    purpose: 'Advertised URLs; the frontend port is also the CORS/SIWE origin.',
  },
  { key: 'DATABASE_URL', purpose: 'PostgreSQL connection string used by Prisma.' },
  { key: 'RPC_URL', purpose: 'JSON-RPC endpoint of the chain (default http://127.0.0.1:7545).' },
  {
    key: 'CHAIN_ID',
    purpose: 'Cross-checked against the running node at startup; mismatch fails closed.',
  },
  {
    key: 'IDENTITY_CONTRACT_ADDRESS',
    purpose: 'Deployed registry address (written by deploy:contract).',
  },
  {
    key: 'JWT_SECRET',
    purpose: 'HMAC key for session JWTs. A value is required for the backend to start.',
    secret: true,
  },
  {
    key: 'JWT_ISSUER / JWT_AUDIENCE',
    purpose: 'Expected iss/aud claims, enforced on every token verification.',
  },
  { key: 'JWT_TTL_SECONDS', purpose: 'Session lifetime in seconds (default 3600).' },
  {
    key: 'SIWE_DOMAIN / SIWE_URI / SIWE_STATEMENT',
    purpose: 'The EIP-4361 fields the server enforces by strict equality.',
  },
  {
    key: 'NONCE_TTL_SECONDS / SIWE_MAX_AGE_SECONDS / CLOCK_SKEW_SECONDS',
    purpose: 'Challenge and message-age bounds (defaults 300 / 300 / 60).',
  },
  { key: 'CORS_ORIGINS', purpose: 'Comma-separated allowlist; must not be * with credentials.' },
  {
    key: 'COOKIE_SECURE / COOKIE_NAME / COOKIE_MAX_AGE_SECONDS',
    purpose: 'Cookie flags; Secure is environment-aware when unset.',
  },
  {
    key: 'RATE_LIMIT_WINDOW_MS / RATE_LIMIT_AUTH_MAX / RATE_LIMIT_GENERAL_MAX',
    purpose: 'Rate limiting (defaults 60000 / 30 / 300).',
  },
  {
    key: 'SESSION_RECHECK_ONCHAIN',
    purpose: 'Re-check the registry on every authenticated request (default true).',
  },
  {
    key: 'ADMIN_PRIVATE_KEY',
    purpose: 'Signs on-chain admin writes; empty disables the admin endpoints (503, fail closed).',
    secret: true,
  },
];
