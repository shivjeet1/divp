import { prisma } from '../prisma';
import { config } from '../config';
import { AppError } from '../errors/AppError';
import { generateJti, signJwt, verifyJwt, type JwtClaims } from '../security/jwt';
import { AuditEvent, recordAudit } from './auditService';
import { normalizeAddress } from '../utils/address';
import type { RoleName } from '../blockchain/registry';

export interface RequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface CreatedSession {
  token: string;
  claims: JwtClaims;
  maxAgeSeconds: number;
}

/**
 * Web2 session lifecycle: creation, verification (JWT + server-side state)
 * and revocation. The JWT is the session representation; PostgreSQL holds
 * revocation state.
 */
export const sessionService = {
  async create(
    walletAddress: string,
    role: RoleName,
    ctx: RequestContext = {},
  ): Promise<CreatedSession> {
    const wallet = normalizeAddress(walletAddress);
    const jti = generateJti();

    const { token, claims } = signJwt(
      {
        sub: wallet,
        role,
        iss: config.jwt.issuer,
        aud: config.jwt.audience,
        jti,
        ttlSeconds: config.jwt.ttlSeconds,
      },
      config.jwt.secret,
    );

    await prisma.session.create({
      data: {
        jti,
        walletAddress: wallet,
        role,
        issuedAt: new Date(claims.iat * 1000),
        expiresAt: new Date(claims.exp * 1000),
        userAgent: ctx.userAgent ? ctx.userAgent.slice(0, 512) : null,
        ipAddress: ctx.ipAddress ?? null,
      },
    });

    await recordAudit(AuditEvent.SESSION_CREATED, {
      walletAddress: wallet,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      metadata: { jti, role, exp: claims.exp },
    });

    return { token, claims, maxAgeSeconds: config.jwt.ttlSeconds };
  },

  /**
   * Full verification: JWT integrity (signature/alg/iss/aud/iat/exp) plus
   * server-side session state (exists, not revoked, not expired).
   */
  async verify(token: unknown, ctx: RequestContext = {}): Promise<JwtClaims> {
    const claims = verifyJwt(token, {
      secret: config.jwt.secret,
      issuer: config.jwt.issuer,
      audience: config.jwt.audience,
      clockSkewSeconds: config.siwe.clockSkewSeconds,
    });

    const session = await prisma.session.findUnique({ where: { jti: claims.jti } });
    if (!session) {
      throw new AppError('SESSION_NOT_FOUND', 401, 'Session does not exist.');
    }
    if (session.revokedAt) {
      throw new AppError('SESSION_REVOKED', 401, 'Session has been revoked. Please sign in again.');
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      await recordAudit(AuditEvent.SESSION_EXPIRED, {
        walletAddress: session.walletAddress,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { jti: claims.jti },
      });
      throw new AppError('SESSION_EXPIRED', 401, 'Session has expired. Please sign in again.');
    }
    if (session.walletAddress !== claims.sub) {
      throw new AppError('TOKEN_CLAIM_INVALID', 401, 'Session state does not match the token.');
    }

    return claims;
  },

  async revoke(jti: string, walletAddress: string, ctx: RequestContext = {}): Promise<boolean> {
    const result = await prisma.session.updateMany({
      where: { jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count > 0) {
      await recordAudit(AuditEvent.SESSION_REVOKED, {
        walletAddress,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { jti },
      });
    }
    return result.count > 0;
  },

  /**
   * Revoke every active session for a wallet. Called by admin actions that
   * change on-chain state (revoke / role change) so that stale Web2 sessions
   * carrying the old role are killed immediately — even when the per-request
   * on-chain re-check is disabled for performance.
   */
  async revokeAllForWallet(walletAddress: string, ctx: RequestContext = {}): Promise<boolean> {
    const wallet = normalizeAddress(walletAddress);
    const result = await prisma.session.updateMany({
      where: { walletAddress: wallet, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count > 0) {
      await recordAudit(AuditEvent.SESSION_REVOKED, {
        walletAddress: wallet,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { all: true, count: result.count },
      });
    }
    return result.count > 0;
  },
};
