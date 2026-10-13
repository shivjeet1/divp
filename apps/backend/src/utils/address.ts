import { getAddress, isAddress } from 'ethers';

/** Strict Ethereum address validation (rejects bad mixed-case checksums). */
export function isValidAddress(value: unknown): value is string {
  return typeof value === 'string' && isAddress(value);
}

/** Canonical form used everywhere for storage/comparison. */
export function normalizeAddress(value: string): string {
  return value.toLowerCase();
}

/** EIP-55 checksummed form used for display and in SIWE messages. */
export function checksumAddress(value: string): string {
  return getAddress(value);
}
