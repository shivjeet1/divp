import { prisma } from '../prisma';

/**
 * Audit logging. Append-only, best-effort for the write itself (a logging
 * failure must never break an authentication decision that already happened),
 * but every write failure is surfaced loudly on stderr.
 *
 * Never pass secrets (tokens, signatures, JWT secrets, private keys) in here.
 */
export const AuditEvent = {
  NONCE_CREATED: 'NONCE_CREATED',
  SIGNATURE_VERIFICATION_STARTED: 'SIGNATURE_VERIFICATION_STARTED',
  SIGNATURE_VERIFICATION_FAILED: 'SIGNATURE_VERIFICATION_FAILED',
  SIGNATURE_VERIFIED: 'SIGNATURE_VERIFIED',
  IDENTITY_AUTHORIZED: 'IDENTITY_AUTHORIZED',
  IDENTITY_REJECTED: 'IDENTITY_REJECTED',
  SESSION_CREATED: 'SESSION_CREATED',
  SESSION_REVOKED: 'SESSION_REVOKED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  LOGOUT: 'LOGOUT',
  ACCOUNT_CHANGED: 'ACCOUNT_CHANGED',
  CHAIN_CHANGED: 'CHAIN_CHANGED',
} as const;

export type AuditEventName = (typeof AuditEvent)[keyof typeof AuditEvent];

export interface AuditContext {
  walletAddress?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(event: AuditEventName, ctx: AuditContext = {}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        event,
        walletAddress: ctx.walletAddress ? ctx.walletAddress.toLowerCase() : null,
        ipAddress: ctx.ipAddress ?? null,
        userAgent: ctx.userAgent ? ctx.userAgent.slice(0, 512) : null,
        metadata: ctx.metadata ? (ctx.metadata as never) : undefined,
      },
    });
  } catch (error) {
    console.error(`[audit] failed to persist ${event}:`, (error as Error).message);
  }
}
