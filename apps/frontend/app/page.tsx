'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { api } from '@/lib/api';
import { EXPECTED_CHAIN_NAME } from '@/lib/config';
import type { ProtectedResponse } from '@/types';

const STATUS_LABEL: Record<string, string> = {
  boot: 'Loading application...',
  disconnected: 'Disconnected',
  connecting: 'Connecting...',
  connected: 'Connected',
  requesting_nonce: 'Requesting nonce...',
  preparing_signature: 'Preparing signature...',
  waiting_for_signature: 'Waiting for MetaMask signature...',
  verifying: 'Verifying identity on the backend...',
  authenticated: 'Authenticated',
  auth_failed: 'Authentication failed',
  wrong_network: 'Wrong network',
  session_expired: 'Session expired',
};

const STATUS_TONE: Record<string, string> = {
  authenticated: 'ok',
  connected: 'info',
  auth_failed: 'err',
  wrong_network: 'warn',
  session_expired: 'warn',
  disconnected: '',
};

const PIPELINE_STEPS = [
  'Connect wallet',
  'Request nonce',
  'Sign SIWE message',
  'Backend verification',
  'On-chain authorization',
  'JWT session cookie',
] as const;

function stepIndex(status: string): number {
  switch (status) {
    case 'boot':
    case 'disconnected':
      return 0;
    case 'connecting':
      return 0;
    case 'connected':
      return 1;
    case 'requesting_nonce':
      return 1;
    case 'preparing_signature':
      return 2;
    case 'waiting_for_signature':
      return 2;
    case 'verifying':
      return 3;
    case 'authenticated':
      return 6;
    default:
      return -1;
  }
}

export default function HomePage() {
  const auth = useAuth();
  const [protectedData, setProtectedData] = useState<ProtectedResponse | null>(null);
  const [roleData, setRoleData] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [identities, setIdentities] = useState<
    Array<{ walletAddress: string; role: string; active: boolean }>
  >([]);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [health, setHealth] = useState<string>('...');
  const [registerAddress, setRegisterAddress] = useState('');

  const refreshProtected = useCallback(async () => {
    try {
      setProtectedData(await api.protected());
    } catch {
      setProtectedData(null);
    }
  }, []);

  useEffect(() => {
    if (auth.status !== 'authenticated') return;
    let cancelled = false;
    api
      .protected()
      .then((data) => {
        if (!cancelled) setProtectedData(data);
      })
      .catch(() => {
        if (!cancelled) setProtectedData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [auth.status]);

  // Derived: never show stale protected data from a previous session.
  const shownProtected = auth.status === 'authenticated' ? protectedData : null;

  useEffect(() => {
    let cancelled = false;
    api
      .getHealth()
      .then((h) => !cancelled && setHealth(`${h.status} (chain ${h.chainId})`))
      .catch(() => !cancelled && setHealth('unreachable'));
    const id = setInterval(() => {
      api
        .getHealth()
        .then((h) => !cancelled && setHealth(`${h.status} (chain ${h.chainId})`))
        .catch(() => !cancelled && setHealth('unreachable'));
    }, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const callRole = async (kind: 'operator' | 'admin') => {
    setRoleError(null);
    try {
      const result = kind === 'operator' ? await api.operatorResource() : await api.adminResource();
      setRoleData(result.message);
    } catch (error) {
      setRoleData(null);
      setRoleError(error instanceof Error ? error.message : 'Request failed');
    }
  };

  const loadIdentities = async () => {
    setAdminError(null);
    try {
      const result = await api.listIdentities();
      setIdentities(result.identities);
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Failed to load identities');
    }
  };

  const step = stepIndex(auth.status);

  return (
    <main>
      <header className="app">
        <div>
          <h1>Decentralized Identity Verification Pipeline</h1>
          <div className="sub">
            MetaMask → SIWE (EIP-4361) → IdentityRegistry → JWT → protected Web2 API
          </div>
        </div>
        <div className="header-actions">
          <span className="sub">
            backend health: <span data-testid="health">{health}</span>
          </span>
          {auth.status === 'authenticated' && (
            <button
              data-testid="logout-button"
              className="danger"
              onClick={() => void auth.logout()}
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      {auth.error && (
        <div className="alert error" data-testid="auth-error" role="alert">
          {auth.error}
        </div>
      )}
      {auth.notice && (
        <div className="alert notice" data-testid="auth-notice">
          {auth.notice}
        </div>
      )}

      <div className="grid">
        {/* ------------------------------------------------ status card */}
        <section className="card" data-testid="status-card">
          <h2>
            Status{' '}
            <span className={`badge ${STATUS_TONE[auth.status] ?? ''}`} data-testid="auth-status">
              {STATUS_LABEL[auth.status] ?? auth.status}
            </span>
          </h2>
          <div className="kv">
            <span className="k">Wallet</span>
            <span className="v" data-testid="wallet-address">
              {auth.address ?? '—'}
            </span>
          </div>
          <div className="kv">
            <span className="k">Network</span>
            <span className="v" data-testid="network">
              {auth.chainId !== null ? `chainId ${auth.chainId}` : '—'}
              {auth.config && auth.chainId !== null && auth.chainId !== auth.config.chainId
                ? ` (expected ${auth.config.chainId})`
                : ''}
            </span>
          </div>
          <div className="kv">
            <span className="k">Expected network</span>
            <span className="v">{EXPECTED_CHAIN_NAME}</span>
          </div>
          <div className="kv">
            <span className="k">Contract</span>
            <span className="v">{auth.config?.contractAddress ?? '—'}</span>
          </div>

          <ul className="steps" data-testid="pipeline-steps">
            {PIPELINE_STEPS.map((label, i) => (
              <li
                key={label}
                className={i === step ? 'active' : step > i || step === 6 ? 'done' : ''}
              >
                {step > i || step === 6 ? '✓ ' : `${i + 1}. `}
                {label}
              </li>
            ))}
          </ul>

          <div style={{ marginTop: 14 }}>
            {!auth.address && (
              <button
                data-testid="connect-button"
                onClick={() => void auth.connect()}
                disabled={auth.status === 'connecting' || !auth.walletAvailable}
              >
                {auth.status === 'connecting' ? 'Connecting...' : 'Connect Wallet'}
              </button>
            )}
            {auth.address && auth.status !== 'authenticated' && (
              <button
                data-testid="signin-button"
                onClick={() => void auth.signIn()}
                disabled={[
                  'requesting_nonce',
                  'preparing_signature',
                  'waiting_for_signature',
                  'verifying',
                ].includes(auth.status)}
              >
                {auth.status === 'waiting_for_signature'
                  ? 'Check MetaMask...'
                  : auth.status === 'verifying'
                    ? 'Verifying...'
                    : 'Sign Authentication Message'}
              </button>
            )}
            {!auth.walletAvailable && (
              <div className="alert error">MetaMask was not detected in this browser.</div>
            )}
          </div>
        </section>

        {/* ------------------------------------------------ session card */}
        <section className="card" data-testid="session-card">
          <h2>Session</h2>
          {auth.session ? (
            <>
              <div className="kv">
                <span className="k">Authenticated wallet</span>
                <span className="v" data-testid="session-wallet">
                  {auth.session.walletAddress}
                </span>
              </div>
              <div className="kv">
                <span className="k">Role (on-chain derived)</span>
                <span className="v" data-testid="session-role">
                  {auth.session.role}
                </span>
              </div>
              <div className="kv">
                <span className="k">Session ID (jti)</span>
                <span className="v">{auth.session.jti}</span>
              </div>
              <div className="kv">
                <span className="k">Expires</span>
                <span className="v">{new Date(auth.session.expiresAt).toLocaleTimeString()}</span>
              </div>
              <p className="hint">
                The JWT lives in an HttpOnly cookie - JavaScript cannot read it. Signing this
                session proved control of the wallet&apos;s private key, which never left MetaMask.
              </p>
            </>
          ) : (
            <p className="hint" data-testid="no-session">
              No active session. Connect a registered wallet and sign the SIWE message to
              authenticate.
            </p>
          )}
        </section>

        {/* ----------------------------------------- registration card */}
        {auth.walletAvailable && auth.status !== 'authenticated' && (
          <section className="card" data-testid="register-card">
            <h2>Register a wallet</h2>
            <p className="hint">
              Enter a wallet address and sign a message in MetaMask to prove you own it. The wallet
              is registered on-chain with the USER role, then you can sign in.
            </p>
            {auth.address && (
              <div className="row">
                <input
                  data-testid="register-address"
                  type="text"
                  placeholder="0x..."
                  value={registerAddress || auth.address || ''}
                  onChange={(e) => setRegisterAddress(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button
                  data-testid="register-button"
                  onClick={() => void auth.register(registerAddress || auth.address || '')}
                  disabled={[
                    'requesting_nonce',
                    'preparing_signature',
                    'waiting_for_signature',
                    'verifying',
                  ].includes(auth.status)}
                >
                  {auth.status === 'waiting_for_signature'
                    ? 'Check MetaMask...'
                    : auth.status === 'verifying'
                      ? 'Verifying...'
                      : 'Register this wallet'}
                </button>
              </div>
            )}
            {!auth.address && <p className="hint">Connect your wallet above to register it.</p>}
          </section>
        )}

        {/* -------------------------------------------- protected card */}
        <section className="card" data-testid="protected-card">
          <h2>Protected Web2 API</h2>
          {shownProtected ? (
            <>
              <div className="kv">
                <span className="k">authenticated</span>
                <span className="v">{String(shownProtected.authenticated)}</span>
              </div>
              <div className="kv">
                <span className="k">walletAddress</span>
                <span className="v" data-testid="protected-wallet">
                  {shownProtected.walletAddress}
                </span>
              </div>
              <div className="kv">
                <span className="k">role</span>
                <span className="v">{shownProtected.role}</span>
              </div>
              <p className="hint">{shownProtected.message}</p>
              <div className="row">
                <button
                  className="secondary"
                  data-testid="refresh-protected"
                  onClick={() => void refreshProtected()}
                >
                  Refresh
                </button>
                <button
                  className="secondary"
                  data-testid="call-operator"
                  onClick={() => void callRole('operator')}
                >
                  Call OPERATOR endpoint
                </button>
                <button
                  className="secondary"
                  data-testid="call-admin"
                  onClick={() => void callRole('admin')}
                >
                  Call ADMIN endpoint
                </button>
              </div>
              {roleData && <div className="alert notice">{roleData}</div>}
              {roleError && <div className="alert error">{roleError}</div>}
            </>
          ) : (
            <p className="hint">Authenticate to call GET /api/protected.</p>
          )}
        </section>
      </div>

      {/* ----------------------------------------------- admin section */}
      {auth.session?.role === 'ADMIN' && (
        <section className="card" style={{ marginTop: 16 }} data-testid="admin-card">
          <h2>Identity administration (on-chain registry)</h2>
          <div className="row">
            <button className="secondary" onClick={() => void loadIdentities()}>
              Refresh identities
            </button>
          </div>
          {adminError && <div className="alert error">{adminError}</div>}
          {identities.length > 0 && (
            <table className="identities" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Wallet</th>
                  <th>Active</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {identities.map((id) => (
                  <tr key={id.walletAddress}>
                    <td>{id.walletAddress}</td>
                    <td>{id.active ? 'yes' : 'no'}</td>
                    <td>{id.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <footer className="app">
        Security model: SIWE proves wallet ownership · IdentityRegistry is the authoritative
        authorization source · PostgreSQL stores nonce/session/audit state · the HS256 JWT in the
        HttpOnly cookie is the Web2 session. The backend independently validates domain, URI, chain
        ID, timestamps, nonce and signature - nothing is trusted from the frontend.
      </footer>
    </main>
  );
}
