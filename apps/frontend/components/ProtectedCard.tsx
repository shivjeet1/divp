'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth, type AuthApi } from '@/hooks/useAuth';
import type { ProtectedResponse } from '@/types';

export function ProtectedCard({ auth }: { auth: AuthApi & ReturnType<typeof useAuth> }) {
  const [protectedData, setProtectedData] = useState<ProtectedResponse | null>(null);

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

  // Never show stale protected data from a previous session.
  const shownProtected = auth.status === 'authenticated' ? protectedData : null;

  return (
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
          </div>
        </>
      ) : (
        <p className="hint">Authenticate to call GET /api/protected.</p>
      )}
    </section>
  );
}
