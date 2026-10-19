'use client';

import { useAuth } from '@/hooks/useAuth';
import { AdminCard } from '@/components/AdminCard';
import { ProtectedCard } from '@/components/ProtectedCard';
import { RegisterCard } from '@/components/RegisterCard';
import { SessionCard } from '@/components/SessionCard';
import { SiteHeader } from '@/components/SiteHeader';
import { StatusCard } from '@/components/StatusCard';

export default function HomePage() {
  const auth = useAuth();

  return (
    <main>
      <SiteHeader auth={auth} />

      {auth.error && (
        <div className="alert error" data-testid="auth-error" role="alert">
          <span>{auth.error}</span>
          <button
            type="button"
            className="alert-dismiss"
            data-testid="alert-dismiss"
            onClick={() => auth.dismissError()}
            aria-label="Dismiss message"
          >
            ✕
          </button>
        </div>
      )}
      {auth.notice && (
        <div className="alert notice" data-testid="auth-notice">
          <span>{auth.notice}</span>
        </div>
      )}

      <div className="grid">
        <StatusCard auth={auth} />
        <SessionCard auth={auth} />
        {auth.walletAvailable && auth.status !== 'authenticated' && <RegisterCard auth={auth} />}
        <ProtectedCard auth={auth} />
      </div>

      {auth.session?.role === 'ADMIN' && <AdminCard />}

      <footer className="app">
        Security model: SIWE proves wallet ownership · IdentityRegistry is the authoritative
        authorization source · PostgreSQL stores nonce/session/audit state · the HS256 JWT in the
        HttpOnly cookie is the Web2 session. The backend independently validates domain, URI, chain
        ID, timestamps, nonce and signature - nothing is trusted from the frontend.
      </footer>
    </main>
  );
}
