'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { IdentityState } from '@/types';

const ROLE_OPTIONS = ['USER', 'OPERATOR', 'ADMIN'] as const;
type RoleOption = (typeof ROLE_OPTIONS)[number];
type Address = `0x${string}`;

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed';
}

export function AdminCard() {
  const [identities, setIdentities] = useState<IdentityState[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyAddress, setBusyAddress] = useState<Address | null>(null);
  const [confirmAddress, setConfirmAddress] = useState<Address | null>(null);
  const [rowRoles, setRowRoles] = useState<Record<string, RoleOption>>({});
  const [newAddress, setNewAddress] = useState('');
  const [newRole, setNewRole] = useState<RoleOption>('USER');

  const loadIdentities = useCallback(async () => {
    setError(null);
    try {
      const response = await api.listIdentities();
      setIdentities(response.identities);
      setLoaded(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .listIdentities()
      .then((response) => {
        if (!cancelled) {
          setIdentities(response.identities);
          setLoaded(true);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const runMutation = useCallback(
    async (address: Address, action: () => Promise<string>) => {
      setBusyAddress(address);
      setError(null);
      setNotice(null);
      try {
        const message = await action();
        setNotice(message);
        setConfirmAddress(null);
        await loadIdentities();
      } catch (err) {
        setError(errorMessage(err));
        setConfirmAddress(null);
      } finally {
        setBusyAddress(null);
      }
    },
    [loadIdentities],
  );

  const rowRole = (identity: IdentityState): RoleOption => {
    const stored = rowRoles[identity.walletAddress.toLowerCase()];
    if (stored) return stored;
    return ROLE_OPTIONS.includes(identity.role as RoleOption)
      ? (identity.role as RoleOption)
      : 'USER';
  };

  const applyRole = (walletAddress: Address, role: RoleOption) =>
    runMutation(walletAddress, async () => {
      await api.setRoleIdentity(walletAddress, role);
      return `Role updated to ${role}. Active sessions for this wallet were revoked.`;
    });

  const revoke = (walletAddress: Address) =>
    runMutation(walletAddress, async () => {
      await api.revokeIdentity(walletAddress);
      return 'Identity revoked on-chain. Active sessions were revoked.';
    });

  const restore = (walletAddress: Address, role: RoleOption) =>
    runMutation(walletAddress, async () => {
      await api.createIdentity(walletAddress, role);
      return `Identity re-registered on-chain as ${role}.`;
    });

  const createNew = async () => {
    const trimmed = newAddress.trim();
    if (!ADDRESS_PATTERN.test(trimmed)) {
      setError('Enter a valid 0x wallet address (40 hex characters).');
      return;
    }
    const address = trimmed as Address;
    await runMutation(address, async () => {
      await api.createIdentity(address, newRole);
      setNewAddress('');
      return `Registered ${address} on-chain as ${newRole}.`;
    });
  };

  const busy = busyAddress !== null;

  return (
    <section className="card card-below" data-testid="admin-card">
      <h2>Identity administration (on-chain registry)</h2>

      <div className="row">
        <button
          className="secondary"
          data-testid="admin-refresh"
          onClick={() => void loadIdentities()}
        >
          Refresh identities
        </button>
      </div>

      {error && (
        <div className="alert error" data-testid="admin-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert notice" data-testid="admin-notice">
          {notice}
        </div>
      )}

      <div className="row">
        <div>
          <label className="field-label" htmlFor="admin-add-address">
            Wallet address
          </label>
          <input
            data-testid="admin-add-address"
            id="admin-add-address"
            type="text"
            placeholder="0x..."
            value={newAddress}
            onChange={(e) => setNewAddress(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="admin-add-role">
            Role
          </label>
          <select
            data-testid="admin-add-role"
            id="admin-add-role"
            value={newRole}
            onChange={(e) => setNewRole(e.target.value as RoleOption)}
          >
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>
        <button data-testid="admin-add" onClick={() => void createNew()} disabled={busy}>
          Register on-chain
        </button>
      </div>

      {loaded && identities.length === 0 && !error && (
        <p className="hint">No identities recorded yet. Register one above.</p>
      )}

      {identities.length > 0 && (
        <table className="identities" data-testid="admin-table">
          <thead>
            <tr>
              <th>Wallet</th>
              <th>Active</th>
              <th>Role</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {identities.map((identity) => {
              const lower = identity.walletAddress.toLowerCase() as Address;
              const confirming = confirmAddress === lower;
              return (
                <tr key={lower} data-testid={`admin-row-${lower}`}>
                  <td>{identity.walletAddress}</td>
                  <td>{identity.active ? 'yes' : 'no'}</td>
                  <td>{identity.role}</td>
                  <td className="actions">
                    <div className="row table-actions">
                      <select
                        aria-label={`Role for ${identity.walletAddress}`}
                        value={rowRole(identity)}
                        disabled={busy}
                        onChange={(e) =>
                          setRowRoles((prev) => ({
                            ...prev,
                            [lower]: e.target.value as RoleOption,
                          }))
                        }
                      >
                        {ROLE_OPTIONS.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                      <button
                        className="secondary"
                        data-testid={`admin-apply-${lower}`}
                        disabled={busy}
                        onClick={() => void applyRole(lower, rowRole(identity))}
                      >
                        Apply
                      </button>
                      {identity.active ? (
                        <button
                          className="danger"
                          data-testid={`admin-revoke-${lower}`}
                          disabled={busy}
                          onClick={() => {
                            if (confirming) {
                              void revoke(lower);
                            } else {
                              setConfirmAddress(lower);
                            }
                          }}
                        >
                          {confirming ? 'Confirm revoke' : 'Revoke'}
                        </button>
                      ) : (
                        <button
                          className="secondary"
                          data-testid={`admin-restore-${lower}`}
                          disabled={busy}
                          onClick={() => void restore(lower, rowRole(identity))}
                        >
                          Restore
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="hint">
        Identity state lives in the IdentityRegistry contract; every change must be signed by the
        ADMIN wallet and revokes that wallet&apos;s active sessions immediately.
      </p>
    </section>
  );
}
