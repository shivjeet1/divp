'use client';

import { useState } from 'react';
import { useAuth, AUTH_BUSY_STATUSES, type AuthApi } from '@/hooks/useAuth';

export function RegisterCard({ auth }: { auth: AuthApi & ReturnType<typeof useAuth> }) {
  const [registerAddress, setRegisterAddress] = useState('');
  const busy = AUTH_BUSY_STATUSES.includes(auth.status as (typeof AUTH_BUSY_STATUSES)[number]);
  const address = registerAddress || auth.address || '';

  return (
    <section className="card" data-testid="register-card">
      <h2>Register a wallet</h2>
      <p className="hint">
        Enter a wallet address and sign a message in MetaMask to prove you own it. The wallet is
        registered on-chain with the USER role, then you can sign in.
      </p>
      {auth.address && (
        <div className="row">
          <div>
            <label className="field-label" htmlFor="register-address">
              Wallet address
            </label>
            <input
              data-testid="register-address"
              id="register-address"
              type="text"
              placeholder="0x..."
              value={address}
              onChange={(e) => setRegisterAddress(e.target.value)}
            />
          </div>
          <button
            data-testid="register-button"
            onClick={() => void auth.register(address)}
            disabled={busy}
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
  );
}
