/**
 * Mermaid diagram sources for the documentation portal.
 *
 * Kept as plain strings so they stay diff-friendly and can be copy-pasted into
 * the markdown docs. Rendered client-side by <Mermaid />.
 */

export const SYSTEM_ARCHITECTURE = `flowchart TB
  subgraph Browser["Browser · http://localhost:3000"]
    direction TB
    UI["Next.js App Router (React 19)"]
    SM["useAuth state machine"]
    SIWE["lib/siwe · EIP-4361 builder"]
    ETH["lib/ethereum · EIP-1193"]
    UI --> SM
    SM --> SIWE
    SM --> ETH
  end

  subgraph Backend["Express backend · http://localhost:4000"]
    direction TB
    MW["helmet · cors(allowlist) · json(32 kB)<br/>cookieParser · originCheck · rateLimit"]
    AUTH["auth pipeline<br/>POST /auth/verify"]
    RA["requireAuth()<br/>JWT → session → on-chain re-check"]
    MW --> AUTH
    MW --> RA
  end

  subgraph Store["Data & truth"]
    direction TB
    PG[("PostgreSQL 16<br/>Nonce · Session · User · AuditLog")]
    CHAIN[("IdentityRegistry.sol<br/>Ganache :7545 · chainId 1337")]
  end

  ETH -->|"fetch · credentials: include"| MW
  AUTH -->|Prisma| PG
  RA -->|Prisma| PG
  AUTH -->|"ethers · JSON-RPC"| CHAIN
  RA -->|"ethers · JSON-RPC"| CHAIN
  AUTH -.->|"Set-Cookie: divp_session (JWT)"| ETH`;

export const AUTH_SEQUENCE = `sequenceDiagram
  autonumber
  participant W as MetaMask
  participant F as Frontend :3000
  participant B as Backend :4000
  participant DB as PostgreSQL
  participant C as IdentityRegistry

  F->>B: GET /auth/config
  B-->>F: chainId · domain · URI · TTLs
  F->>W: eth_requestAccounts + eth_chainId
  W-->>F: address + chainId
  Note over F,W: chainId != config -> wrong_network<br/>UI offers wallet_switchEthereumChain(1337)
  F->>B: POST /auth/nonce { address }
  B->>DB: INSERT Nonce (single-use, TTL 300s)
  B-->>F: { nonce, expiresAt }
  F->>W: personal_sign (EIP-4361 message)
  W-->>F: signature
  F->>B: POST /auth/verify { message, signature }
  B->>B: 1 parse EIP-4361 (strict grammar)
  B->>B: 2 policy: domain / URI / chain / version / time
  B->>DB: 3 nonce lookup (bound to address)
  B->>B: 4 recoverSigner(raw bytes) == address
  B->>DB: 5 UPDATE Nonce SET usedAt WHERE usedAt IS NULL
  B->>C: 6 authorize(address)
  C-->>B: role (USER / OPERATOR / ADMIN)
  B->>DB: 7 upsert User · INSERT Session (jti)
  B-->>F: Set-Cookie divp_session (HS256 JWT)
  F->>B: GET /api/protected (cookie)
  B->>C: re-check identity (SESSION_RECHECK_ONCHAIN)
  B-->>F: { authenticated, walletAddress, role, ... }`;

export const FRONTEND_STATE_MACHINE = `stateDiagram-v2
  [*] --> boot
  boot --> disconnected: /auth/config ok
  boot --> auth_failed: backend unreachable
  disconnected --> connected: connect()
  connected --> requesting_nonce: signIn()
  requesting_nonce --> preparing_signature
  preparing_signature --> waiting_for_signature
  waiting_for_signature --> verifying
  verifying --> authenticated: /auth/verify 200
  verifying --> auth_failed: pipeline error
  connected --> wrong_network: connect() with chainId != config
  authenticated --> wrong_network: chainChanged to another chain
  wrong_network --> connected: switchNetwork() / chainChanged on expected chain
  authenticated --> disconnected: accountsChanged / logout()
  authenticated --> session_expired: /auth/me 401
  session_expired --> requesting_nonce: signIn() again`;

export const DATA_MODEL = `erDiagram
  User ||--o{ Session : authenticates
  User ||--o{ Nonce : requests

  User {
    string walletAddress PK
    datetime createdAt
  }
  Nonce {
    string value PK
    string walletAddress
    datetime expiresAt
    datetime usedAt
  }
  Session {
    string jti PK
    string walletAddress
    datetime expiresAt
    datetime revokedAt
  }
  AuditLog {
    string id PK
    string event
    datetime timestamp
  }`;

export const TRUST_BOUNDARY = `flowchart LR
  subgraph U["Untrusted · attacker-controlled"]
    B["Browser / wallet<br/>any client code<br/>hand-crafted HTTP"]
  end
  subgraph T["Backend · trusted compute"]
    API["Express API<br/>re-validates everything<br/>never trusts the client"]
  end
  subgraph A["Authoritative"]
    C["IdentityRegistry<br/>roles + active status"]
  end
  B -->|"requests (never trusted)"| API
  API -->|"authorize() / getIdentity()"| C`;

export const ADMIN_FLOW = `flowchart TB
  A["Admin request<br/>cookie + Origin"] --> B{"requireAuth()<br/>+ requireRole('ADMIN')"}
  B -->|deny| D["401 AUTH_REQUIRED<br/>403 ROLE_FORBIDDEN"]
  B -->|allow| C["adminController"]
  C --> E["Sign tx with ADMIN_PRIVATE_KEY"]
  E --> F["IdentityRegistry<br/>register / setRole / setActive"]
  F --> G["onlyAdmin enforced on-chain"]
  C --> H["sessionService.revokeAllForWallet()"]
  H --> I["Active Web2 sessions revoked<br/>immediately"]`;

export const REGISTRATION_FLOW = `flowchart TB
  A["POST /auth/register<br/>{ message, signature }"] --> B["Verify SIWE signature<br/>(signer == claimed address)"]
  B -->|invalid| E1["401 SIGNATURE_INVALID"]
  B -->|valid| C{"getIdentityState(address)"}
  C -->|"known (active or revoked)"| E2["403 ALREADY_REGISTERED<br/>admin-only reactivation"]
  C -->|unknown| D["register(address, USER)<br/>signed by ADMIN_PRIVATE_KEY"]
  D --> F["201 { registered: true, role: USER }"]
  D -.->|"key unset"| E3["503 ADMIN_SIGNER_NOT_CONFIGURED"]`;
