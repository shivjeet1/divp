export interface Fact {
  label: string;
  value: string;
}

export interface StackLayer {
  layer: string;
  tech: string;
  role: string;
}

export const HERO = {
  eyebrow: 'Decentralized Identity Verification Pipeline',
  title: 'Documentation & Visualization',
  tagline:
    'Sign in with Ethereum (EIP-4361 / SIWE), verified server-side against a single-use nonce and the on-chain IdentityRegistry contract, then bridged into a traditional Web2 session: a manually-issued HS256 JWT in an HttpOnly cookie that authorizes a protected Express API.',
  disclaimer:
    'Nothing here is mocked: real ECDSA recovery, real HMAC-SHA256 JWTs built with Node’s native crypto, real contract calls, real database transactions.',
};

export const FACTS: Fact[] = [
  { label: 'Auth standard', value: 'EIP-4361 · Sign in with Ethereum' },
  { label: 'Signature scheme', value: 'ECDSA (secp256k1) recovery' },
  { label: 'Session token', value: 'Manual HS256 JWT · HttpOnly cookie' },
  { label: 'Authorization truth', value: 'IdentityRegistry.sol on-chain' },
  { label: 'Datastore', value: 'PostgreSQL 16 via Prisma' },
  { label: 'Chain (dev)', value: 'Ganache · chainId 1337' },
  { label: 'Backend', value: 'Express + TypeScript' },
  { label: 'Frontend', value: 'Next.js 15 (App Router)' },
];

export const STACK: StackLayer[] = [
  {
    layer: 'Frontend',
    tech: 'Next.js 15 · React 19 · ethers',
    role: 'Wallet connect, SIWE message building, auth state machine, wrong-network switch, and a role-aware dashboard (session, self-registration, protected API, ADMIN registry console).',
  },
  {
    layer: 'Backend',
    tech: 'Express · TypeScript · zod',
    role: 'SIWE verification pipeline, session/JWT issuance, role-gated API, admin endpoints.',
  },
  {
    layer: 'Data',
    tech: 'PostgreSQL 16 · Prisma',
    role: 'Nonces, sessions, local wallet metadata and an append-only audit log.',
  },
  {
    layer: 'Chain',
    tech: 'Solidity · Hardhat · Ganache',
    role: 'IdentityRegistry: the authoritative source of roles and active status.',
  },
  {
    layer: 'Docs portal',
    tech: 'Vite · React · Mermaid',
    role: 'This site: architecture, interactive flow, API and security documentation.',
  },
];

export interface RepoRow {
  path: string;
  what: string;
}

export const REPO_LAYOUT: RepoRow[] = [
  { path: 'contracts/', what: 'Solidity IdentityRegistry + Hardhat tests, deploy & seed scripts' },
  {
    path: 'apps/backend/',
    what: 'Express + TypeScript API (SIWE verify, sessions, role auth, admin)',
  },
  {
    path: 'apps/frontend/',
    what: 'Next.js app (wallet connect, SIWE flow, role-aware dashboard, admin console) + tests',
  },
  { path: 'apps/docs/', what: 'This documentation & visualization portal (Vite, port 5173)' },
  { path: 'prisma/', what: 'PostgreSQL schema + migrations (Nonce, Session, User, AuditLog)' },
  { path: 'scripts/', what: 'generate-env.js (.env bootstrap), smoke-auth.js (live attack demo)' },
  {
    path: 'docs/',
    what: 'Markdown source: architecture, threat model, API reference, security testing',
  },
  { path: 'start.sh', what: 'One command to run dev (Ganache + backend + frontend + docs)' },
];

export interface Highlight {
  title: string;
  detail: string;
}

export const HIGHLIGHTS: Highlight[] = [
  {
    title: 'Real cryptography, no shortcuts',
    detail:
      'ECDSA recovery over the exact raw message bytes; a hand-rolled HS256 JWT using Node’s crypto module with algorithm pinning and constant-time comparison.',
  },
  {
    title: 'The chain is the source of truth',
    detail:
      'Roles and active status live in IdentityRegistry. The backend re-checks the contract per request and revokes sessions the moment an identity stops being authorized.',
  },
  {
    title: 'Ten attacks, each proven blocked',
    detail:
      'Replay, wrong wallet/chain/domain, revoked identity, JWT tampering, expiry, wallet switching and more — each asserted across contract, backend, frontend and smoke layers.',
  },
  {
    title: 'Fail-closed configuration',
    detail:
      'zod-validated env, Chain-ID cross-checked against the running node at startup, admin writes disabled (503) when the signing key is absent.',
  },
  {
    title: 'Session revocation that actually bites',
    detail:
      'A perfectly signed JWT is worthless without its server-side Session row; logout, admin revoke and role changes all kill live sessions immediately.',
  },
  {
    title: 'Self-registration without a back door',
    detail:
      'Anyone can register a wallet they provably control as USER — but a revoked wallet cannot be re-registered to bypass revocation.',
  },
];
