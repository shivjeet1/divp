import { BACKEND_URL } from './config';
import type { ApiError } from '@/types';

export class BackendRequestError extends Error implements ApiError {
  readonly code: string;
  readonly error: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'BackendRequestError';
    this.code = code;
    this.error = code;
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    credentials: 'include', // cookies are the session
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });

  const body = (await res.json().catch(() => ({}))) as T & Partial<ApiError>;
  if (!res.ok) {
    throw new BackendRequestError(
      body.error ?? 'UNKNOWN_ERROR',
      body.message ?? `Request failed with status ${res.status}`,
      res.status,
    );
  }
  return body;
}

export const api = {
  getConfig: () => request<import('@/types').BackendConfig>('/auth/config'),

  getHealth: () =>
    request<{ status: string; chainId: number; checks: Record<string, { ok: boolean }> }>(
      '/health',
    ),

  createNonce: (address: string) =>
    request<import('@/types').NonceResponse>('/auth/nonce', {
      method: 'POST',
      body: JSON.stringify({ address }),
    }),

  verify: (message: string, signature: string) =>
    request<import('@/types').SessionInfo>('/auth/verify', {
      method: 'POST',
      body: JSON.stringify({ message, signature }),
    }),

  register: (message: string, signature: string) =>
    request<{ registered: boolean; walletAddress: string; role: 'USER' }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ message, signature }),
    }),

  me: () => request<import('@/types').SessionInfo>('/auth/me'),

  logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  protected: () => request<import('@/types').ProtectedResponse>('/api/protected'),

  operatorResource: () => request<{ message: string; role: string }>('/api/protected/operator'),

  adminResource: () => request<{ message: string; role: string }>('/api/protected/admin'),

  listIdentities: () =>
    request<{ identities: import('@/types').IdentityState[]; count: number }>('/admin/identities'),

  createIdentity: (address: string, role: 'USER' | 'OPERATOR' | 'ADMIN') =>
    request<{ created: boolean }>('/admin/identities', {
      method: 'POST',
      body: JSON.stringify({ address, role }),
    }),

  revokeIdentity: (address: string) =>
    request<{ revoked: boolean }>(`/admin/identities/${address}`, { method: 'DELETE' }),

  setRoleIdentity: (address: string, role: 'USER' | 'OPERATOR' | 'ADMIN') =>
    request<{ updated: boolean; walletAddress: string; role: string }>(
      `/admin/identities/${address}`,
      { method: 'PATCH', body: JSON.stringify({ role }) },
    ),

  clientEvent: (
    event: 'ACCOUNT_CHANGED' | 'CHAIN_CHANGED',
    payload: { walletAddress?: string; chainId?: number; detail?: string },
  ) =>
    request<{ accepted: boolean }>('/auth/events', {
      method: 'POST',
      body: JSON.stringify({ event, ...payload }),
    }),
};
