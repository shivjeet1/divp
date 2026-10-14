export interface BackendConfig {
  chainId: number;
  domain: string;
  uri: string;
  statement: string;
  version: string;
  nonceTtlSeconds: number;
  siweMaxAgeSeconds: number;
  contractAddress: string | null;
  cookieName: string;
}

export interface SessionInfo {
  authenticated: boolean;
  walletAddress: string;
  role: 'USER' | 'OPERATOR' | 'ADMIN';
  jti: string;
  issuedAt: string;
  expiresAt: string;
}

export interface NonceResponse {
  address: string;
  nonce: string;
  expiresAt: string;
  ttlSeconds: number;
}

export type AuthStatus =
  | 'boot'
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'requesting_nonce'
  | 'preparing_signature'
  | 'waiting_for_signature'
  | 'verifying'
  | 'authenticated'
  | 'auth_failed'
  | 'wrong_network'
  | 'session_expired';

export interface ProtectedResponse {
  authenticated: boolean;
  walletAddress: string;
  role: string;
  jti: string;
  message: string;
  serverTime: string;
}

export interface IdentityState {
  walletAddress: string;
  registered: boolean;
  active: boolean;
  role: 'NONE' | 'USER' | 'OPERATOR' | 'ADMIN';
}

export interface ApiError {
  error: string;
  message: string;
}
