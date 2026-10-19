export interface TestSuite {
  suite: string;
  command: string;
  count: string;
  what: string;
}

export interface TestLayer {
  layer: string;
  detail: string;
}

export const TEST_MATRIX: TestSuite[] = [
  {
    suite: 'Contract · Hardhat',
    command: 'npm run test:contracts',
    count: '26 / 26',
    what: 'IdentityRegistry roles, admin-only writes (deployer-admin + non-admin revert), registration/reactivation, events.',
  },
  {
    suite: 'Backend · Vitest',
    command: 'npm run test:backend',
    count: '89',
    what: 'JWT matrix, SIWE parse/policy, nonces, middleware (origin, rate limit), live PostgreSQL + Ganache integration, and the attack demos.',
  },
  {
    suite: 'Frontend · Vitest',
    command: 'npm run test:frontend',
    count: '18',
    what: 'SIWE builder, API client, and the auth state machine (account/network switch, reload mismatch).',
  },
  {
    suite: 'End-to-end · Playwright',
    command: 'npm run test:e2e',
    count: '14',
    what: 'Real browser: connect → sign → protected API → logout, role gates, self-registration, account/network switches; plus 6 direct API attack demos.',
  },
  {
    suite: 'Live smoke · node',
    command: 'npm run smoke',
    count: 'ALL PASS',
    what: 'Drives the real contract + database through the running HTTP API and prints BLOCKED for each attack.',
  },
  {
    suite: 'Docs portal · Vitest',
    command: 'npm run test:docs',
    count: 'content',
    what: 'Content-integrity checks: every section is navigable, endpoints are well-formed, pipeline steps are sequential.',
  },
];

export const TEST_LAYERS: TestLayer[] = [
  {
    layer: 'Contract layer',
    detail:
      'Hardhat tests the registry in isolation: role assignment, onlyAdmin enforcement, the registerIdentity reactivation semantics, and events.',
  },
  {
    layer: 'Backend unit + integration',
    detail:
      'Vitest runs the JWT and SIWE matrices without I/O, then integration suites against live PostgreSQL and Ganache — including the concurrent-replay race (exactly one session wins).',
  },
  {
    layer: 'Frontend unit',
    detail:
      'Vitest + Testing Library drive the auth state machine with a mocked EIP-1193 provider: replay rejection, unregistered wallets, and forced re-auth on account/network switch.',
  },
  {
    layer: 'Browser E2E',
    detail:
      'Playwright injects a provider and exercises the full pipeline in a real browser; role gates are replayed with the browser session cookie against the operator/admin routes, and direct HTTP attacks run against the running backend.',
  },
  {
    layer: 'Live smoke',
    detail:
      'A node script drives the actual deployed contract and database over HTTP, asserting each attack is blocked end to end.',
  },
];

export const TEST_NOTES: string[] = [
  'Prerequisites for the live suites: docker compose up -d, npm run chain, npm run seed:identities, a migrated database, and a running backend.',
  'Every mutating request in tests/curl/E2E sends Origin: http://localhost:3000 — the Origin rule is itself part of what is being tested.',
  'The test environment raises the rate limits (NODE_ENV=test) so the suite is not self-throttled; production limits are 30 / 300 per minute.',
  'smoke is a real end-to-end run against the running backend and prints BLOCKED for each attack.',
];
