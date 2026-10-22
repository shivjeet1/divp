# Decentralized Identity Verification Pipeline

Sign in with Ethereum (EIP-4361 / SIWE), verified server-side against a
single-use nonce and the on-chain `IdentityRegistry` contract, then bridged into
a Web2 session: an HS256 JWT in an HttpOnly cookie that authorizes calls to a
protected Express API.

```
MetaMask ──SIWE message + signature──▶ Express backend ──reads──▶ IdentityRegistry.sol (Ganache)
   ▲                                      │
   │                                      ├── PostgreSQL: nonces, sessions, audit log
   └──── HttpOnly session cookie ◀────────┘
```

Nothing is mocked: real ECDSA recovery, real HMAC-SHA256 JWTs built with Node's
native `crypto`, real contract calls, real database transactions.

## Youtube Demo Link :

[Demo Link](https://youtu.be/b_eJo0jXJpw?si=-F1VBWGSIkcI840P)
## Run it

Requires Node ≥ 20 and Docker (for PostgreSQL).

```bash
npm install
npm install-scripts approve --all   # npm ≥ 12 blocks lifecycle scripts
npm run setup:env                   # writes .env
docker compose up -d
npm run db:migrate

./start.sh   # Ganache :7545 · backend :4000 · frontend :3000 · docs :5173
```

Open <http://localhost:3000> and sign in with MetaMask (RPC
`http://127.0.0.1:7545`, chain id `1337`) using a seeded account.

`./start.sh` brings up a local Ganache node and deploys/seeds the contract when
needed. `./start.sh --prod` builds once and serves all four services.

## Layout

| Path             | What it is                                                  |
| ---------------- | ----------------------------------------------------------- |
| `contracts/`     | Solidity `IdentityRegistry` + Hardhat tests, deploy & seed  |
| `apps/backend/`  | Express + TypeScript API (SIWE verify, sessions, role auth) |
| `apps/frontend/` | Next.js app (wallet connect, SIWE flow, protected views)    |
| `apps/docs/`     | Documentation portal (Vite + React + Mermaid)               |
| `prisma/`        | PostgreSQL schema + migrations                              |

## Docs

Everything else — architecture, the 12-stage authentication pipeline, the API
reference, the threat model, security testing, seeded accounts, environment
variables and every command — lives in the documentation portal:

```bash
npm run dev:docs   # http://localhost:5173  (also started by ./start.sh)
```
