#!/usr/bin/env bash
#
# start.sh - start the application with one command.
#
# Usage:
#   ./start.sh            # dev: Ganache (if needed) + backend + frontend + docs
#   ./start.sh --prod     # production: build once, then serve compiled bundles
#
# Dev mode also starts a local Ganache node when one is not already running and
# bootstraps a fresh chain (deploy contract + seed identities), so the
# fail-closed backend always has a valid chain to talk to. The documentation
# portal (apps/docs) is served on :5173. All child processes run in this
# terminal; Ctrl+C stops them all.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

PROD=0
if [[ "${1:-}" == "--prod" ]]; then
  PROD=1
fi

# --- helpers -----------------------------------------------------------------

# Read a KEY=value line out of .env without sourcing it.
get_env() {
  sed -nE "s/^${1}=(.*)$/\1/p" .env | tail -n 1
}

# Return 0 if something is already listening on 127.0.0.1:$1.
port_in_use() {
  (echo >"/dev/tcp/127.0.0.1/$1") 2>/dev/null
}

# Return 0 if the configured RPC endpoint answers JSON-RPC eth_chainId.
rpc_up() {
  curl -s -m 2 -X POST -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    "$RPC_URL" 2>/dev/null | grep -q '"result"'
}

# Return 0 if IdentityRegistry bytecode exists at the configured address.
contract_deployed() {
  local addr code
  addr="$(get_env IDENTITY_CONTRACT_ADDRESS)"
  [[ -n "$addr" ]] || return 1
  code="$(curl -s -m 3 -X POST -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"$addr\",\"latest\"],\"id\":1}" \
    "$RPC_URL" 2>/dev/null | sed -nE 's/.*"result":"(0x[0-9a-fA-F]*)".*/\1/p')"
  [[ -n "$code" && "$code" != "0x" ]]
}

# --- 1. Prerequisites ---------------------------------------------------------

if [[ ! -f .env ]]; then
  echo "error: missing .env - run \`npm run setup:env\` first." >&2
  exit 1
fi

BACKEND_URL="$(get_env BACKEND_URL)"
BACKEND_URL="${BACKEND_URL:-http://localhost:4000}"
FRONTEND_URL="$(get_env FRONTEND_URL)"
FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
DOCS_URL="$(get_env DOCS_URL)"
DOCS_URL="${DOCS_URL:-http://localhost:5173}"
RPC_URL="$(get_env RPC_URL)"
RPC_URL="${RPC_URL:-http://127.0.0.1:7545}"
CHAIN_ID="$(get_env CHAIN_ID)"
CHAIN_ID="${CHAIN_ID:-1337}"

# Ports from the URLs (http://localhost:PORT -> PORT)
BACKEND_PORT="${BACKEND_URL##*:}"
BACKEND_PORT="${BACKEND_PORT%%/*}"
FRONTEND_PORT="${FRONTEND_URL##*:}"
FRONTEND_PORT="${FRONTEND_PORT%%/*}"
DOCS_PORT="${DOCS_URL##*:}"
DOCS_PORT="${DOCS_PORT%%/*}"
RPC_PORT="${RPC_URL##*:}"
RPC_PORT="${RPC_PORT%%/*}"

# Ports must be free, otherwise a second instance would crash on EADDRINUSE.
if port_in_use "$BACKEND_PORT"; then
  echo "error: port $BACKEND_PORT is already in use - another backend is running." >&2
  echo "       stop it first, e.g.: pkill -f 'tsx watch src/server.ts'" >&2
  exit 1
fi
if port_in_use "$FRONTEND_PORT"; then
  echo "error: port $FRONTEND_PORT is already in use - another frontend is running." >&2
  echo "       stop it first, e.g.: pkill -f 'next dev'" >&2
  exit 1
fi
if port_in_use "$DOCS_PORT"; then
  echo "error: port $DOCS_PORT is already in use - the docs server is already running." >&2
  echo "       stop it first, e.g.: pkill -f 'vite'" >&2
  exit 1
fi

# PostgreSQL must be reachable (only checked for local DATABASE_URLs).
DB_URL="$(get_env DATABASE_URL)"
DB_HOST="$(printf '%s' "$DB_URL" | sed -nE 's#.*@([^:/]+):([0-9]+)/.*#\1#p')"
DB_PORT="$(printf '%s' "$DB_URL" | sed -nE 's#.*@([^:/]+):([0-9]+)/.*#\2#p')"
if [[ "$DB_HOST" == "localhost" || "$DB_HOST" == "127.0.0.1" ]]; then
  if ! (echo >"/dev/tcp/$DB_HOST/${DB_PORT:-5432}") 2>/dev/null; then
    echo "error: PostgreSQL not reachable at $DB_HOST:${DB_PORT:-5432}" >&2
    echo "       -> start it with: docker compose up -d" >&2
    exit 1
  fi
fi

# --- process bookkeeping (declared before anything is started) ----------------

pids=()

cleanup() {
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
}

trap 'echo; echo "==> Stopping servers..."; cleanup' EXIT INT TERM

# --- 1b. Local blockchain (dev only) -----------------------------------------
# The backend is fail-closed on the chain: without a node it exits at startup,
# which surfaces in the UI as "Backend unreachable". So in dev we make sure the
# chain exists, and bootstrap it if it is still empty (fresh chain after a
# reboot). In prod the chain is external and must be managed out of band.

if [[ $PROD -eq 0 ]]; then
  if rpc_up; then
    echo "==> Blockchain: using node already running at $RPC_URL"
  else
    if port_in_use "$RPC_PORT"; then
      echo "error: port $RPC_PORT is in use but not answering JSON-RPC at $RPC_URL." >&2
      echo "       stop whatever is on that port, or fix RPC_URL in .env." >&2
      exit 1
    fi
    echo "==> Starting Ganache...    $RPC_URL (chainId $CHAIN_ID)"
    # Direct (single-process) launch so Ctrl+C stops it cleanly - the args
    # mirror the `chain` script in contracts/package.json.
    node "$ROOT/node_modules/ganache/dist/node/cli.js" \
      --server.port "$RPC_PORT" \
      --chain.chainId "$CHAIN_ID" \
      --wallet.mnemonic "test test test test test test test test test test test junk" \
      --wallet.totalAccounts 10 \
      --miner.blockGasLimit 30000000 &
    pids+=("$!")

    for _ in $(seq 1 30); do
      rpc_up && break
      sleep 1
    done
    if ! rpc_up; then
      echo "error: Ganache did not become ready at $RPC_URL" >&2
      exit 1
    fi
  fi

  # A fresh chain has no registry bytecode at the configured address.
  if ! contract_deployed; then
    echo "==> Fresh chain: compiling, deploying and seeding the registry..."
    if [[ ! -f contracts/artifacts/src/IdentityRegistry.sol/IdentityRegistry.json ]]; then
      npm run compile
    fi
    npm run deploy:contract
    npm run seed:identities
  fi
fi

# --- 2. Production build ------------------------------------------------------

if [[ $PROD -eq 1 ]]; then
  echo "==> Building production bundles..."
  npm run build:backend
  npm run build:frontend
  npm run build:docs
fi

# --- 3. Start both servers ----------------------------------------------------

echo "==> Starting backend...  $BACKEND_URL"
if [[ $PROD -eq 1 ]]; then
  PORT="$BACKEND_PORT" node apps/backend/dist/server.js &
else
  PORT="$BACKEND_PORT" npm run dev:backend &
fi
pids+=("$!")

echo "==> Starting frontend... $FRONTEND_URL"
if [[ $PROD -eq 1 ]]; then
  (cd apps/frontend && exec npx --no-install next start -p "$FRONTEND_PORT") &
else
  (cd apps/frontend && exec npx --no-install next dev -p "$FRONTEND_PORT") &
fi
pids+=("$!")

echo "==> Starting docs...     $DOCS_URL"
if [[ $PROD -eq 1 ]]; then
  (cd apps/docs && exec npx --no-install vite preview --port "$DOCS_PORT" --strictPort) &
else
  (cd apps/docs && exec npx --no-install vite --port "$DOCS_PORT" --strictPort) &
fi
pids+=("$!")

echo
echo "  Blockchain: $RPC_URL  (dev)"
echo "  Backend   : $BACKEND_URL  (health: $BACKEND_URL/health)"
echo "  Frontend  : $FRONTEND_URL"
echo "  Docs      : $DOCS_URL"
echo "  Press Ctrl+C to stop all."
echo

# --- 4. Watch: when one server exits, stop the others and mirror its code -----

code=0
while :; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid" 2>/dev/null || code=$?
      exit "$code"
    fi
  done
  sleep 1
done
