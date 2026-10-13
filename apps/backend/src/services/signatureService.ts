import { verifyMessage } from 'ethers';
import { AppError } from '../errors/AppError';
import { normalizeAddress } from '../utils/address';

const SIG_RE = /^0x[0-9a-fA-F]+$/;

/**
 * Recovers the Ethereum address that produced an EIP-191 `personal_sign`
 * signature over the exact SIWE message bytes.
 */
export function recoverSigner(message: string, signature: unknown): string {
  if (typeof signature !== 'string' || !SIG_RE.test(signature)) {
    throw new AppError('SIGNATURE_MALFORMED', 401, 'Signature is malformed.');
  }
  const byteLength = (signature.length - 2) / 2;
  // 65 bytes (r,s,v) or 64 bytes (EIP-2098 r,vs)
  if (byteLength !== 65 && byteLength !== 64) {
    throw new AppError('SIGNATURE_MALFORMED', 401, 'Signature has an unexpected length.');
  }

  let recovered: string;
  try {
    recovered = verifyMessage(message, signature);
  } catch {
    throw new AppError('SIGNATURE_INVALID', 401, 'Signature is not a valid Ethereum signature.');
  }
  return recovered;
}

/**
 * SEC-05: the recovered signer must be exactly the wallet claimed in the
 * SIWE message (case-insensitive address comparison).
 */
export function assertSignerMatches(messageAddress: string, recovered: string): void {
  if (normalizeAddress(recovered) !== normalizeAddress(messageAddress)) {
    throw new AppError(
      'SIGNATURE_INVALID',
      401,
      'Signature does not belong to the claimed wallet.',
    );
  }
}
