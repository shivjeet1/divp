/**
 * useAuth state machine tests.
 *
 * A deterministic EIP-1193 provider (ethers Wallet behind `personal_sign`) is
 * injected as `window.ethereum`, and `fetch` is replaced with a simulated
 * backend that issues single-use nonces and validates signatures the same way
 * the real backend does (recover -> compare, replay -> rejected).
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { Wallet, verifyMessage } from 'ethers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/hooks/useAuth';
import type { Eip1193Provider } from '@/lib/ethereum';

// ---------------------------------------------------------------------------
// Fake wallet provider (accounts #1 and #4 of the well-known test mnemonic)
// ---------------------------------------------------------------------------
const USER_WALLET = new Wallet(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
); // #1
const UNREGISTERED_WALLET = new Wallet(
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
); // #4

interface FakeProvider extends Eip1193Provider {
  accounts: string[];
  /** Accounts MetaMask would offer if the user approves the connection prompt. */
  unlocked: string[];
  chainIdHex: string;
  emit(event: string, ...args: unknown[]): void;
}

function createProvider(unlocked: string[], chainIdHex = '0x539'): FakeProvider {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const wallets = new Map<string, Wallet>(
    [USER_WALLET, UNREGISTERED_WALLET].map((w) => [w.address.toLowerCase(), w]),
  );

  const provider: FakeProvider = {
    isMetaMask: true,
    accounts: [],
    unlocked,
    chainIdHex,
    emit(event, ...args) {
      listeners.get(event)?.forEach((handler) => handler(...args));
    },
    on(event, handler) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler as (...args: unknown[]) => void);
    },
    removeListener(event, handler) {
      listeners.get(event)?.delete(handler as (...args: unknown[]) => void);
    },
    async request({ method, params }) {
      switch (method) {
        case 'eth_accounts':
          return provider.accounts;
        case 'eth_requestAccounts':
          // user approves the connection prompt
          provider.accounts = provider.unlocked;
          return provider.accounts;
        case 'eth_chainId':
          return provider.chainIdHex;
        case 'personal_sign': {
          const [message, address] = params as [string, string];
          const wallet = wallets.get(address.toLowerCase());
          if (!wallet) throw new Error(`unknown account ${address}`);
          return wallet.signMessage(message);
        }
        default:
          throw new Error(`unsupported method ${method}`);
      }
    },
  };
  return provider;
}

// ---------------------------------------------------------------------------
// Simulated backend (single-use nonces, signature verification, sessions)
// ---------------------------------------------------------------------------
interface SimSession {
  walletAddress: string;
  role: 'USER' | 'OPERATOR' | 'ADMIN';
  jti: string;
  issuedAt: string;
  expiresAt: string;
  authenticated: boolean;
}

const CONFIG = {
  chainId: 1337,
  domain: 'localhost:3000',
  uri: 'http://localhost:3000',
  statement: 'Sign in to the Decentralized Identity Verification Pipeline.',
  version: '1',
  nonceTtlSeconds: 300,
  siweMaxAgeSeconds: 300,
  contractAddress: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
  cookieName: 'divp_session',
};

const REGISTRY = new Map<string, 'USER' | 'OPERATOR' | 'ADMIN'>([
  [USER_WALLET.address.toLowerCase(), 'USER'],
]);

function createSimBackend() {
  const issuedNonces = new Map<string, string>(); // nonce -> address (single-use)
  let session: SimSession | null = null;
  const calls: string[] = [];

  const json = (status: number, body: unknown) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const path = url.replace('http://localhost:4000', '');
    const method = (init.method ?? 'GET').toUpperCase();
    calls.push(`${method} ${path}`);

    if (path === '/auth/config' && method === 'GET') return json(200, CONFIG);

    if (path === '/auth/nonce' && method === 'POST') {
      const { address } = JSON.parse(String(init.body)) as { address: string };
      if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
        return json(400, { error: 'INVALID_ADDRESS', message: 'Invalid wallet address.' });
      }
      const nonce = `sim-nonce-${Math.random().toString(36).slice(2, 12)}`;
      issuedNonces.set(nonce, address.toLowerCase());
      return json(201, {
        address,
        nonce,
        expiresAt: new Date(Date.now() + 300_000).toISOString(),
        ttlSeconds: 300,
      });
    }

    if (path === '/auth/verify' && method === 'POST') {
      const { message, signature } = JSON.parse(String(init.body)) as {
        message: string;
        signature: string;
      };
      let recovered: string;
      try {
        recovered = verifyMessage(message, signature);
      } catch {
        return json(401, { error: 'INVALID_SIGNATURE', message: 'Signature verification failed.' });
      }

      const nonceLine = message.split('\n').find((l) => l.startsWith('Nonce: '));
      const nonce = nonceLine?.slice('Nonce: '.length) ?? '';
      const issuer = issuedNonces.get(nonce);
      if (!issuer) {
        return json(401, { error: 'NONCE_REPLAYED', message: 'Nonce already used or unknown.' });
      }
      issuedNonces.delete(nonce); // single-use
      if (issuer !== recovered.toLowerCase()) {
        return json(401, { error: 'SIGNER_MISMATCH', message: 'Wrong wallet.' });
      }
      if (!message.includes('localhost:3000 wants you to sign in')) {
        return json(401, { error: 'DOMAIN_MISMATCH', message: 'Wrong domain.' });
      }
      const role = REGISTRY.get(recovered.toLowerCase());
      if (!role) {
        return json(403, {
          error: 'IDENTITY_NOT_REGISTERED',
          message: 'Wallet is not registered on-chain.',
        });
      }
      session = {
        walletAddress: recovered,
        role,
        jti: `jti-${Math.random().toString(36).slice(2, 10)}`,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        authenticated: true,
      };
      return json(201, session);
    }

    if (path === '/auth/me' && method === 'GET') {
      if (!session)
        return json(401, { error: 'AUTH_REQUIRED', message: 'Authentication required.' });
      return json(200, session);
    }

    if (path === '/auth/logout' && method === 'POST') {
      session = null;
      return json(200, { success: true });
    }

    if (path === '/auth/events' && method === 'POST') return json(202, { accepted: true });

    if (path === '/api/protected' && method === 'GET') {
      if (!session)
        return json(401, { error: 'AUTH_REQUIRED', message: 'Authentication required.' });
      return json(200, {
        authenticated: true,
        walletAddress: session.walletAddress,
        role: session.role,
        jti: session.jti,
        message: 'Authenticated request succeeded.',
        serverTime: new Date().toISOString(),
      });
    }

    return json(404, { error: 'NOT_FOUND', message: `no sim route for ${method} ${path}` });
  });

  return {
    fetchMock,
    calls,
    currentSession: () => session,
    clearSession: () => {
      session = null;
    },
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------
let provider: FakeProvider;
let backend: ReturnType<typeof createSimBackend>;

beforeEach(() => {
  // Not yet connected to the site; eth_requestAccounts auto-approves (like an
  // unlocked MetaMask) and exposes the USER wallet on chainId 1337.
  provider = createProvider([USER_WALLET.address], '0x539');
  backend = createSimBackend();
  (window as unknown as { ethereum?: FakeProvider }).ethereum = provider;
  vi.stubGlobal('fetch', backend.fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (window as unknown as { ethereum?: FakeProvider }).ethereum;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAuth', () => {
  it('boots to disconnected with backend config and wallet detected', async () => {
    provider.accounts = []; // no authorized account yet
    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.status).toBe('disconnected'));
    expect(result.current.walletAvailable).toBe(true);
    expect(result.current.config?.chainId).toBe(1337);
    expect(result.current.address).toBeNull();
    expect(result.current.session).toBeNull();
  });

  it('reports auth_failed when the backend is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.status).toBe('auth_failed'));
    expect(result.current.error).toContain('Backend unreachable');
  });

  it('connects a wallet on the expected chain', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status).toBe('disconnected'));

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => expect(result.current.status).toBe('connected'));
    expect(result.current.address).toBe(USER_WALLET.address);
    expect(result.current.chainId).toBe(1337);
  });

  it('flags wrong_network when MetaMask is on a different chain', async () => {
    provider.chainIdHex = '0x1'; // Ethereum mainnet
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status).toBe('disconnected'));

    await act(async () => {
      await result.current.connect();
    });

    await waitFor(() => expect(result.current.status).toBe('wrong_network'));
    expect(result.current.error).toContain('Wrong network');
  });

  it('runs the full SIWE flow: nonce -> sign -> verify -> authenticated session', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status).toBe('disconnected'));

    await act(async () => {
      await result.current.connect();
    });
    await waitFor(() => expect(result.current.status).toBe('connected'));

    await act(async () => {
      await result.current.signIn();
    });

    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.session?.role).toBe('USER');
    expect(result.current.session?.walletAddress).toBe(USER_WALLET.address);
    expect(result.current.notice).toContain('Authenticated as USER');

    // nonce endpoint was actually used exactly once
    expect(backend.calls.filter((c) => c === 'POST /auth/nonce')).toHaveLength(1);

    // protected resource works with the session cookie in the simulated backend
    const protectedResponse = await fetch('http://localhost:4000/api/protected', {
      credentials: 'include',
    });
    expect(protectedResponse.ok).toBe(true);
  });

  it('rejects replaying the same SIWE signature with a second nonce request', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status).toBe('disconnected'));
    await act(async () => {
      await result.current.connect();
    });
    await waitFor(() => expect(result.current.status).toBe('connected'));

    // capture the first signed message by intercepting personal_sign output
    let firstMessage: string | null = null;
    const originalRequest = provider.request.bind(provider);
    provider.request = async (args) => {
      const response = await originalRequest(args);
      if (args.method === 'personal_sign') firstMessage = String((args.params as unknown[])[0]);
      return response;
    };

    await act(async () => {
      await result.current.signIn();
    });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(firstMessage).toBeTruthy();

    // replay the exact same signed message against a backend whose nonces were consumed
    const replay = await fetch('http://localhost:4000/auth/verify', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: firstMessage, signature: '0xdeadbeef' }),
    });
    expect(replay.ok).toBe(false);
    const body = (await replay.json()) as { error: string };
    expect(['NONCE_REPLAYED', 'INVALID_SIGNATURE']).toContain(body.error);
  });

  it('blocks an unregistered wallet with IDENTITY_NOT_REGISTERED', async () => {
    provider.accounts = [UNREGISTERED_WALLET.address];
    provider.unlocked = [UNREGISTERED_WALLET.address];
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status).toBe('connected'));

    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.signIn();
    });

    await waitFor(() => expect(result.current.status).toBe('auth_failed'));
    expect(result.current.error).toContain('not registered');
    expect(result.current.session).toBeNull();
  });

  it('requires re-authentication when the MetaMask account changes', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status).toBe('disconnected'));
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.signIn();
    });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    // switch to the unregistered wallet
    await act(async () => {
      provider.accounts = [UNREGISTERED_WALLET.address];
      provider.emit('accountsChanged', [UNREGISTERED_WALLET.address]);
    });

    await waitFor(() => expect(result.current.session).toBeNull());
    expect(result.current.status).not.toBe('authenticated');
    expect(result.current.address).toBe(UNREGISTERED_WALLET.address);
    // the server-side session was revoked by the forced re-authentication
    expect(backend.currentSession()).toBeNull();
    expect(backend.calls).toContain('POST /auth/logout');
  });

  it('forces re-authentication when the network changes', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status).toBe('disconnected'));
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.signIn();
    });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      provider.emit('chainChanged', '0x1');
    });

    await waitFor(() => expect(result.current.session).toBeNull());
    await waitFor(() => expect(result.current.status).toBe('wrong_network'));
    expect(result.current.chainId).toBe(1);
    expect(backend.currentSession()).toBeNull();
  });

  it('logout revokes the server session and returns to connected', async () => {
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status).toBe('disconnected'));
    await act(async () => {
      await result.current.connect();
    });
    await act(async () => {
      await result.current.signIn();
    });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));

    await act(async () => {
      await result.current.logout();
    });

    await waitFor(() => expect(result.current.status).toBe('connected'));
    expect(result.current.session).toBeNull();
    expect(backend.currentSession()).toBeNull();
    expect(result.current.notice).toContain('Signed out');
  });

  it('restores an existing session across reload when the wallet still matches', async () => {
    // establish a session in one render
    const first = renderHook(() => useAuth());
    await waitFor(() => expect(first.result.current.status).toBe('disconnected'));
    await act(async () => {
      await first.result.current.connect();
    });
    await act(async () => {
      await first.result.current.signIn();
    });
    await waitFor(() => expect(first.result.current.status).toBe('authenticated'));
    first.unmount();

    // "reload": same wallet is already authorized in the provider
    provider.accounts = [USER_WALLET.address];
    const second = renderHook(() => useAuth());
    await waitFor(() => expect(second.result.current.status).toBe('authenticated'));
    expect(second.result.current.session?.role).toBe('USER');
    // /auth/me restored the session without a new signature
    expect(backend.calls.filter((c) => c === 'POST /auth/verify')).toHaveLength(1);
  });

  it('logs the session out on reload when the wallet no longer matches', async () => {
    const first = renderHook(() => useAuth());
    await waitFor(() => expect(first.result.current.status).toBe('disconnected'));
    await act(async () => {
      await first.result.current.connect();
    });
    await act(async () => {
      await first.result.current.signIn();
    });
    await waitFor(() => expect(first.result.current.status).toBe('authenticated'));
    first.unmount();

    provider.accounts = [UNREGISTERED_WALLET.address];
    const second = renderHook(() => useAuth());
    await waitFor(() => expect(second.result.current.notice).toContain('different wallet'));
    expect(second.result.current.session).toBeNull();
    expect(backend.currentSession()).toBeNull();
  });
});
