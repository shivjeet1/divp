'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth, type AuthApi } from '@/hooks/useAuth';

export function SiteHeader({ auth }: { auth: AuthApi & ReturnType<typeof useAuth> }) {
  const [health, setHealth] = useState('checking...');

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const result = await api.getHealth();
        if (!cancelled) {
          setHealth(`${result.status} (chain ${result.chainId})`);
        }
      } catch {
        if (!cancelled) {
          setHealth('unreachable');
        }
      }
    };
    void check();
    const interval = setInterval(() => void check(), 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const healthTone = health.startsWith('ok')
    ? 'ok'
    : health === 'unreachable' || health === 'degraded'
      ? 'err'
      : 'warn';

  return (
    <header className="app">
      <div>
        <h1>Decentralized Identity Verification Pipeline</h1>
        <div className="sub">
          MetaMask → SIWE (EIP-4361) → IdentityRegistry → JWT → protected Web2 API
        </div>
      </div>
      <div className="header-actions">
        <span className="sub">
          backend health:{' '}
          <span className={`badge ${healthTone}`} data-testid="health">
            {health}
          </span>
        </span>
        {auth.status === 'authenticated' && (
          <button className="danger" data-testid="logout-button" onClick={() => void auth.logout()}>
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}
