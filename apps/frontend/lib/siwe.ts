import { getAddress } from 'ethers';
import type { BackendConfig, NonceResponse } from '@/types';

/**
 * Builds an EIP-4361 (Sign-In with Ethereum) message.
 *
 * The backend re-parses and re-validates every field of this message
 * against its own configuration - this builder only provides convenience.
 */
export function buildSiweMessage(params: {
  config: BackendConfig;
  nonce: NonceResponse;
  address: string;
  now?: Date;
}): { message: string; issuedAt: string; expirationTime: string; requestId: string } {
  const { config, nonce, address } = params;
  const now = params.now ?? new Date();
  const issuedAt = now.toISOString();
  const expirationTime = new Date(now.getTime() + nonce.ttlSeconds * 1000).toISOString();
  const requestId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const message = [
    `${config.domain} wants you to sign in with your Ethereum account:`,
    getAddress(address),
    '',
    config.statement,
    '',
    `URI: ${config.uri}`,
    `Version: ${config.version}`,
    `Chain ID: ${config.chainId}`,
    `Nonce: ${nonce.nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expirationTime}`,
    `Request ID: ${requestId}`,
  ].join('\n');

  return { message, issuedAt, expirationTime, requestId };
}
