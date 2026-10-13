import { getRegistryContract, roleName, type RoleName } from '../blockchain/registry';
import { config } from '../config';
import { AppError } from '../errors/AppError';
import { AuditEvent, recordAudit } from './auditService';
import { normalizeAddress } from '../utils/address';

export interface AuthorizationContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuthorizationSuccess {
  authorized: true;
  role: RoleName;
}

/**
 * On-chain authorization (FR-07 / Phase 7).
 *
 * The IdentityRegistry contract is the authoritative source: registered AND
 * active AND role != NONE. A stale database role is never consulted, and the
 * frontend's claimed role is never trusted.
 */
export const authorizationService = {
  async authorize(
    walletAddress: string,
    ctx: AuthorizationContext = {},
  ): Promise<AuthorizationSuccess> {
    const wallet = normalizeAddress(walletAddress);

    const contract = getRegistryContract();
    let registered: boolean;
    let active: boolean;
    let roleValue: bigint;
    try {
      const result = await contract.getIdentity(wallet);
      registered = result[0];
      active = result[1];
      roleValue = result[2];
    } catch {
      await recordAudit(AuditEvent.IDENTITY_REJECTED, {
        walletAddress: wallet,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { reason: 'CHAIN_UNAVAILABLE' },
      });
      throw new AppError(
        'CHAIN_UNAVAILABLE',
        503,
        'Identity registry is unreachable. Authentication cannot be completed.',
      );
    }

    if (!registered) {
      await recordAudit(AuditEvent.IDENTITY_REJECTED, {
        walletAddress: wallet,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { reason: 'NOT_REGISTERED' },
      });
      throw new AppError(
        'IDENTITY_NOT_REGISTERED',
        403,
        'This wallet is not registered in the IdentityRegistry.',
      );
    }
    if (!active) {
      await recordAudit(AuditEvent.IDENTITY_REJECTED, {
        walletAddress: wallet,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { reason: 'REVOKED' },
      });
      throw new AppError('IDENTITY_INACTIVE', 403, 'This wallet identity has been revoked.');
    }
    if (Number(roleValue) === 0) {
      await recordAudit(AuditEvent.IDENTITY_REJECTED, {
        walletAddress: wallet,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { reason: 'ROLE_NONE' },
      });
      throw new AppError('IDENTITY_ROLE_INVALID', 403, 'This wallet has no authorization role.');
    }

    const role = roleName(Number(roleValue));
    await recordAudit(AuditEvent.IDENTITY_AUTHORIZED, {
      walletAddress: wallet,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: { role },
    });
    return { authorized: true, role };
  },

  /** Non-throwing on-chain identity read (registered/active flags only). */
  async getIdentityState(walletAddress: string): Promise<{ registered: boolean; active: boolean }> {
    const wallet = normalizeAddress(walletAddress);
    const contract = getRegistryContract();
    try {
      const result = await contract.getIdentity(wallet);
      return { registered: result[0], active: result[1] };
    } catch {
      throw new AppError('CHAIN_UNAVAILABLE', 503, 'Identity registry is unreachable.');
    }
  },

  /** Non-throwing variant used by the health check. */
  async probe(): Promise<{ ok: boolean; detail?: string }> {
    if (!config.blockchain.contractAddress) {
      return { ok: false, detail: 'contract address not configured' };
    }
    try {
      const contract = getRegistryContract();
      const owner = await contract.owner();
      return { ok: typeof owner === 'string' };
    } catch (error) {
      return { ok: false, detail: (error as Error).message.slice(0, 200) };
    }
  },
};
