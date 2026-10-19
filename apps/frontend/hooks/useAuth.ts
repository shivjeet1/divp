'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, BackendRequestError } from '@/lib/api';
import {
  describeError,
  getAccounts,
  getChainId,
  getProvider,
  onAccountsChanged,
  onChainChanged,
  personalSign,
  requestAccounts,
  switchEthereumChain,
} from '@/lib/ethereum';
import { buildSiweMessage } from '@/lib/siwe';
import type { AuthStatus, BackendConfig, SessionInfo } from '@/types';

export interface AuthState {
  status: AuthStatus;
  address: string | null;
  chainId: number | null;
  session: SessionInfo | null;
  config: BackendConfig | null;
  error: string | null;
  notice: string | null;
  walletAvailable: boolean;
}

const initialState: AuthState = {
  status: 'boot',
  address: null,
  chainId: null,
  session: null,
  config: null,
  error: null,
  notice: null,
  walletAvailable: false,
};

/**
 * Authentication state machine.
 *
 * States: boot -> disconnected -> connecting -> connected ->
 * requesting_nonce -> preparing_signature -> waiting_for_signature ->
 * verifying -> authenticated | auth_failed | wrong_network | session_expired
 *
 * Also owns the MetaMask `accountsChanged` / `chainChanged` subscriptions:
 * a wallet or network switch after authentication invalidates the local
 * state, revokes the server-side session and requires re-authentication
 * (FR-14, FR-15).
 */
export function useAuth() {
  const [state, setState] = useState<AuthState>(initialState);
  const sessionRef = useRef<SessionInfo | null>(null);
  const addressRef = useRef<string | null>(null);
  useEffect(() => {
    sessionRef.current = state.session;
    addressRef.current = state.address;
  }, [state.session, state.address]);

  const patch = useCallback((next: Partial<AuthState>) => {
    setState((prev) => ({ ...prev, ...next }));
  }, []);

  const hardReset = useCallback((status: AuthStatus, notice?: string, error?: string | null) => {
    setState((prev) => ({
      ...prev,
      status,
      session: null,
      error: error ?? null,
      notice: notice ?? null,
    }));
  }, []);

  /** Revokes the server session and clears local authentication state. */
  const forceReauthenticate = useCallback(
    async (notice: string) => {
      if (sessionRef.current) {
        await api.logout().catch(() => undefined);
      }
      hardReset(addressRef.current ? 'connected' : 'disconnected', notice);
    },
    [hardReset],
  );

  // ------------------------------------------------------------------
  // Boot: config, silent reconnect, session restore
  // ------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const provider = getProvider();
      const walletAvailable = Boolean(provider);

      let config: BackendConfig | null = null;
      try {
        config = await api.getConfig();
      } catch (error) {
        if (!cancelled) {
          patch({
            status: 'auth_failed',
            walletAvailable,
            error: `Backend unreachable: ${describeError(error)}`,
          });
        }
        return;
      }
      if (cancelled) return;
      patch({ config, walletAvailable });

      const accounts = provider ? await getAccounts(provider) : [];
      const chainId = provider ? await getChainId(provider).catch(() => null) : null;

      // Restore an existing HTTP-only session, if any.
      let session: SessionInfo | null = null;
      try {
        session = await api.me();
      } catch (error) {
        const code = error instanceof BackendRequestError ? error.code : 'UNKNOWN';
        if (code === 'TOKEN_EXPIRED' || code === 'SESSION_EXPIRED' || code === 'SESSION_REVOKED') {
          if (!cancelled) patch({ status: 'session_expired', error: 'Your session has expired.' });
          return;
        }
        // No session at all -> normal signed-out boot.
      }
      if (cancelled) return;

      const current = accounts[0] ?? null;
      const wrongChain = config && chainId !== null && chainId !== config.chainId;

      if (session) {
        // Account-switch protection across reloads: the session wallet must
        // still be the wallet selected in MetaMask.
        if (!current || current.toLowerCase() !== session.walletAddress.toLowerCase()) {
          await api.logout().catch(() => undefined);
          patch({
            status: current ? 'connected' : 'disconnected',
            address: current,
            chainId,
            error: null,
            notice: 'Session restored for a different wallet - re-authentication required.',
          });
          return;
        }
        patch({
          status: wrongChain ? 'wrong_network' : 'authenticated',
          address: current,
          chainId,
          session,
          error: wrongChain ? 'Switch back to the expected network.' : null,
        });
        return;
      }

      patch({ status: current ? 'connected' : 'disconnected', address: current, chainId });
    })();

    return () => {
      cancelled = true;
    };
  }, [patch]);

  // ------------------------------------------------------------------
  // MetaMask subscriptions (FR-14 / FR-15)
  // ------------------------------------------------------------------
  useEffect(() => {
    const provider = getProvider();
    if (!provider) return;

    const unsubscribeAccounts = onAccountsChanged(provider, (accounts) => {
      const next = accounts[0]?.toLowerCase() ?? null;
      const previous = addressRef.current?.toLowerCase() ?? null;
      if (next === previous) return;

      void api
        .clientEvent('ACCOUNT_CHANGED', {
          walletAddress: next ?? undefined,
          detail: 'MetaMask account changed',
        })
        .catch(() => undefined);

      if (sessionRef.current && next !== sessionRef.current.walletAddress.toLowerCase()) {
        // Wallet A authenticated -> MetaMask switched to Wallet B:
        // never continue treating B as A.
        void forceReauthenticate(
          'MetaMask account changed - please sign in again with the new wallet.',
        );
        setState((prev) => ({ ...prev, address: accounts[0] ?? null }));
      } else {
        setState((prev) => ({
          ...prev,
          address: accounts[0] ?? null,
          status: accounts[0] ? 'connected' : 'disconnected',
          session: null,
          error: null,
          notice: accounts[0] ? 'Wallet changed - sign in to continue.' : null,
        }));
      }
    });

    const unsubscribeChain = onChainChanged(provider, (chainIdHex) => {
      const chainId = Number.parseInt(chainIdHex, 16);
      void api
        .clientEvent('CHAIN_CHANGED', { chainId, detail: 'MetaMask network changed' })
        .catch(() => undefined);

      setState((prev) => ({ ...prev, chainId }));
      // Network switch -> re-authentication (per implementation plan §23).
      void forceReauthenticate(
        'Network changed - please verify your identity again on the expected network.',
      ).then(() => {
        setState((prev) => ({
          ...prev,
          chainId,
          status:
            prev.config && chainId !== prev.config.chainId
              ? 'wrong_network'
              : prev.address
                ? 'connected'
                : 'disconnected',
        }));
      });
    });

    return () => {
      unsubscribeAccounts();
      unsubscribeChain();
    };
  }, [forceReauthenticate]);

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------
  const connect = useCallback(async () => {
    const provider = getProvider();
    if (!provider) {
      patch({
        status: 'auth_failed',
        error: 'MetaMask is not available. Install the MetaMask extension and reload.',
      });
      return;
    }
    patch({ status: 'connecting', error: null, notice: null });
    try {
      const accounts = await requestAccounts(provider);
      const chainId = await getChainId(provider);
      const config = state.config ?? (await api.getConfig());
      patch({
        status: chainId !== config.chainId ? 'wrong_network' : 'connected',
        address: accounts[0] ?? null,
        chainId,
        config,
        error:
          chainId !== config.chainId
            ? 'Wrong network: switch MetaMask to the expected chain.'
            : null,
      });
    } catch (error) {
      patch({ status: 'auth_failed', error: describeError(error) });
    }
  }, [patch, state.config]);

  const signIn = useCallback(async () => {
    const provider = getProvider();
    if (!provider || !state.address || !state.config) {
      patch({ status: 'auth_failed', error: 'Connect your wallet first.' });
      return;
    }

    try {
      // 1. fresh nonce from the backend
      patch({ status: 'requesting_nonce', error: null, notice: null });
      const nonce = await api.createNonce(state.address);

      // 2. build the EIP-4361 message
      patch({ status: 'preparing_signature' });
      const { message } = buildSiweMessage({
        config: state.config,
        nonce,
        address: state.address,
      });

      // 3. MetaMask signature (private key never leaves the wallet)
      patch({ status: 'waiting_for_signature' });
      const signature = await personalSign(provider, message, state.address);

      // 4. backend verification + on-chain authorization + session
      patch({ status: 'verifying' });
      const session = await api.verify(message, signature);

      patch({
        status: 'authenticated',
        session,
        error: null,
        notice: `Authenticated as ${session.role}.`,
      });
    } catch (error) {
      const message = describeError(error);
      const code = error instanceof BackendRequestError ? error.code : undefined;
      if (code === 'NONCE_EXPIRED' || code === 'SESSION_EXPIRED') {
        hardReset('session_expired', undefined, message);
        return;
      }
      patch({ status: 'auth_failed', error: message });
    }
  }, [patch, hardReset, state.address, state.config]);

  const register = useCallback(
    async (address: string) => {
      const provider = getProvider();
      if (!provider || !state.config) {
        patch({ status: 'auth_failed', error: 'Connect your wallet first.' });
        return;
      }

      try {
        // 1. fresh nonce from the backend
        patch({ status: 'requesting_nonce', error: null, notice: null });
        const nonce = await api.createNonce(address);

        // 2. build the EIP-4361 message
        patch({ status: 'preparing_signature' });
        const { message } = buildSiweMessage({ config: state.config, nonce, address });

        // 3. MetaMask signature proves ownership of `address` (key never leaves wallet)
        patch({ status: 'waiting_for_signature' });
        const signature = await personalSign(provider, message, address);

        // 4. backend re-verifies the signature and registers the wallet on-chain as USER
        patch({ status: 'verifying' });
        const result = await api.register(message, signature);

        patch({
          status: 'connected',
          error: null,
          notice: `Wallet registered as ${result.role}. You can now sign in.`,
        });
      } catch (error) {
        const message = describeError(error);
        const code = error instanceof BackendRequestError ? error.code : undefined;
        if (code === 'NONCE_EXPIRED') {
          hardReset('session_expired', undefined, message);
          return;
        }
        patch({ status: 'auth_failed', error: message });
      }
    },
    [patch, hardReset, state.config],
  );

  const logout = useCallback(async () => {
    try {
      await api.logout();
      hardReset(state.address ? 'connected' : 'disconnected', 'Signed out. Session revoked.');
    } catch (error) {
      // Session already invalid server-side - still clear local state.
      hardReset(state.address ? 'connected' : 'disconnected', 'Signed out.', describeError(error));
    }
  }, [hardReset, state.address]);

  const dismissError = useCallback(() => patch({ error: null, notice: null }), [patch]);

  /**
   * Asks MetaMask to switch to the chain the backend expects. On success the
   * wallet's `chainChanged` event drives the state machine back towards
   * `connected`; failures are surfaced in the auth error message.
   */
  const switchNetwork = useCallback(async () => {
    const provider = getProvider();
    if (!provider || !state.config) {
      patch({ error: 'Connect your wallet first.' });
      return;
    }
    try {
      await switchEthereumChain(provider, state.config.chainId);
      patch({ notice: 'Switch request sent - confirm the network in your wallet.' });
    } catch (error) {
      patch({ error: describeError(error) });
    }
  }, [patch, state.config]);

  return { ...state, connect, signIn, register, logout, switchNetwork, dismissError };
}

export type AuthApi = ReturnType<typeof useAuth>;

/** Statuses where a sign-in or registration flow is in flight. */
export const AUTH_BUSY_STATUSES: AuthStatus[] = [
  'requesting_nonce',
  'preparing_signature',
  'waiting_for_signature',
  'verifying',
];
