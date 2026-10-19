'use client';

import { useAuth, type AuthApi } from '@/hooks/useAuth';

export function SessionCard({ auth }: { auth: AuthApi & ReturnType<typeof useAuth> }) {
  return (
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
            <span className="v" data-testid="session-expires">
              {new Date(auth.session.expiresAt).toLocaleTimeString()}
            </span>
          </div>
          <p className="hint">
            The JWT lives in an HttpOnly cookie - JavaScript cannot read it. Signing this session
            proved control of the wallet&apos;s private key, which never left MetaMask.
          </p>
        </>
      ) : (
        <p className="hint" data-testid="no-session">
          No active session. Connect a registered wallet and sign the SIWE message to authenticate.
        </p>
      )}
    </section>
  );
}
