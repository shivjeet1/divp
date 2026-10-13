import { randomBytes } from 'crypto';
import { prisma } from '../prisma';
import { config } from '../config';
import { AppError } from '../errors/AppError';
import { AuditEvent, recordAudit } from './auditService';
import { normalizeAddress } from '../utils/address';

/** How long consumed / expired nonces are retained for replay diagnostics. */
const RETENTION_MS = 24 * 60 * 60 * 1000;

export interface IssuedNonce {
  nonce: string;
  expiresAt: string;
  ttlSeconds: number;
}

/**
 * Nonce lifecycle.
 *
 * - 256-bit CSPRNG value, base64url encoded (unpredictable)
 * - bound to one wallet address (lower-cased)
 * - single-use, enforced by an atomic conditional UPDATE on consumption
 * - expires after NONCE_TTL_SECONDS
 */
export const nonceService = {
  /** Generate a nonce value (exported for unit tests). */
  generateValue(): string {
    return randomBytes(32).toString('base64url');
  },

  async issue(walletAddress: string): Promise<IssuedNonce> {
    const wallet = normalizeAddress(walletAddress);
    const now = new Date();

    // Opportunistic cleanup: drop rows far past their retention window.
    await prisma.nonce.deleteMany({
      where: { expiresAt: { lt: new Date(Date.now() - RETENTION_MS) } },
    });

    const expiresAt = new Date(now.getTime() + config.siwe.nonceTtlSeconds * 1000);
    const value = this.generateValue();

    await prisma.nonce.create({
      data: { walletAddress: wallet, value, expiresAt },
    });

    await recordAudit(AuditEvent.NONCE_CREATED, {
      walletAddress: wallet,
      metadata: { expiresAt: expiresAt.toISOString() },
    });

    return {
      nonce: value,
      expiresAt: expiresAt.toISOString(),
      ttlSeconds: config.siwe.nonceTtlSeconds,
    };
  },

  /**
   * Pre-signature validation: the nonce must exist, belong to this wallet,
   * still be unused and unexpired.
   */
  async lookup(value: string, walletAddress: string): Promise<void> {
    const wallet = normalizeAddress(walletAddress);
    const row = await prisma.nonce.findUnique({ where: { value } });

    if (!row)
      throw new AppError('NONCE_NOT_FOUND', 401, 'The authentication nonce does not exist.');
    if (row.walletAddress !== wallet) {
      throw new AppError('SIWE_NONCE_MISMATCH', 401, 'The nonce was not issued for this wallet.');
    }
    if (row.usedAt) {
      throw new AppError(
        'NONCE_ALREADY_USED',
        401,
        'The authentication nonce has already been consumed.',
      );
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new AppError('NONCE_EXPIRED', 401, 'The authentication nonce has expired.');
    }
  },

  /**
   * Atomic single-use consumption. The conditional UPDATE only matches when
   * the nonce is still unused and unexpired, so of N concurrent attempts
   * exactly one observes `count === 1`; the rest get a diagnosis.
   */
  async consume(value: string, walletAddress: string): Promise<void> {
    const wallet = normalizeAddress(walletAddress);
    const now = new Date();

    const claimed = await prisma.nonce.updateMany({
      where: {
        value,
        walletAddress: wallet,
        usedAt: null,
        expiresAt: { gt: now },
      },
      data: { usedAt: now },
    });

    if (claimed.count === 1) return;

    // Lost the race (or invalid state) - diagnose precisely.
    const row = await prisma.nonce.findUnique({ where: { value } });
    if (!row) {
      throw new AppError('NONCE_NOT_FOUND', 401, 'The authentication nonce does not exist.');
    }
    if (row.usedAt) {
      throw new AppError(
        'NONCE_ALREADY_USED',
        401,
        'The authentication nonce has already been consumed.',
      );
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new AppError('NONCE_EXPIRED', 401, 'The authentication nonce has expired.');
    }
    if (row.walletAddress !== wallet) {
      throw new AppError('SIWE_NONCE_MISMATCH', 401, 'The nonce was not issued for this wallet.');
    }
    throw new AppError(
      'NONCE_ALREADY_USED',
      401,
      'The authentication nonce has already been consumed.',
    );
  },
};
