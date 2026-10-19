'use client';

import { useAuth, AUTH_BUSY_STATUSES, type AuthApi } from '@/hooks/useAuth';
import { EXPECTED_CHAIN_NAME } from '@/lib/config';

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
    case 'connecting':
      return 0;
    case 'connected':
    case 'requesting_nonce':
      return 1;
    case 'preparing_signature':
    case 'waiting_for_signature':
      return 2;
    case 'verifying':
      return 3;
    case 'authenticated':
      return PIPELINE_STEPS.length;
    default:
      return -1;
  }
}

export function StatusCard({ auth }: { auth: AuthApi & ReturnType<typeof useAuth> }) {
  const step = stepIndex(auth.status);
  const busy = AUTH_BUSY_STATUSES.includes(auth.status as (typeof AUTH_BUSY_STATUSES)[number]);
  const expectedChainId = auth.config?.chainId ?? 1337;

  return (
    <section className="card" data-testid="status-card" aria-busy={busy}>
      <h2>
        Status{' '}
        <span
          className={`badge ${STATUS_TONE[auth.status] ?? ''}`}
          data-testid="auth-status"
          aria-live="polite"
        >
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
            className={
              i === step ? 'active' : step > i || step === PIPELINE_STEPS.length ? 'done' : ''
            }
          >
            {step > i || step === PIPELINE_STEPS.length ? '✓ ' : `${i + 1}. `}
            {label}
          </li>
        ))}
      </ul>

      <div className="cta">
        {!auth.address && (
          <button
            data-testid="connect-button"
            onClick={() => void auth.connect()}
            disabled={auth.status === 'connecting' || !auth.walletAvailable}
          >
            {auth.status === 'connecting' ? 'Connecting...' : 'Connect Wallet'}
          </button>
        )}
        {auth.status === 'wrong_network' && (
          <button data-testid="switch-network-button" onClick={() => void auth.switchNetwork()}>
            Switch to chain {expectedChainId}
          </button>
        )}
        {auth.address && auth.status !== 'authenticated' && auth.status !== 'wrong_network' && (
          <button data-testid="signin-button" onClick={() => void auth.signIn()} disabled={busy}>
            {auth.status === 'waiting_for_signature'
              ? 'Check MetaMask...'
              : auth.status === 'verifying'
                ? 'Verifying...'
                : 'Sign Authentication Message'}
          </button>
        )}
        {auth.status === 'wrong_network' && (
          <p className="hint">
            Sign-in is paused: the backend only accepts SIWE messages for chain {expectedChainId}.
            Switch your wallet to continue.
          </p>
        )}
        {!auth.walletAvailable && (
          <div className="alert error">MetaMask was not detected in this browser.</div>
        )}
      </div>
    </section>
  );
}
