import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { prisma } from '../prisma';
import { errors } from '../errors/AppError';
import { isValidAddress, checksumAddress } from '../utils/address';
import { nonceService } from '../services/nonceService';
import { authService } from '../services/authService';
import { registerService } from '../services/registerService';
import { authorizationService } from '../services/authorizationService';
import { AuditEvent, recordAudit } from '../services/auditService';

const NonceRequest = z.object({
  address: z.string().refine(isValidAddress, 'A valid Ethereum address is required.'),
});

const VerifyRequest = z.object({
  message: z.string().min(1).max(8192),
  signature: z.string().regex(/^0x[0-9a-fA-F]+$/, 'A hex signature is required.'),
});

const EventRequest = z.object({
  event: z.enum(['ACCOUNT_CHANGED', 'CHAIN_CHANGED']),
  walletAddress: z
    .string()
    .optional()
    .refine((v) => v === undefined || isValidAddress(v), 'Invalid Ethereum address.'),
  chainId: z.number().int().optional(),
  detail: z.string().max(200).optional(),
});

function setSessionCookie(res: Response, token: string, maxAgeSeconds: number): void {
  res.cookie(config.cookie.name, token, {
    httpOnly: true,
    secure: config.cookie.secure, // true in production; documented dev exception for http://localhost
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeSeconds * 1000,
  });
}

export const healthController = async (_req: Request, res: Response): Promise<void> => {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true };
  } catch {
    checks.database = { ok: false, detail: 'unreachable' };
  }

  try {
    const network = await authorizationService.probe();
    checks.identityRegistry = { ok: network.ok, detail: network.detail };
    checks.rpc = { ok: network.ok, detail: network.detail };
  } catch {
    checks.rpc = { ok: false, detail: 'unreachable' };
  }

  const ok = Object.values(checks).every((c) => c.ok);
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ok' : 'degraded',
    service: 'identity-auth-api',
    chainId: config.blockchain.chainId,
    contractAddress: config.blockchain.contractAddress ?? null,
    checks,
    timestamp: new Date().toISOString(),
  });
};

/** Public, security-relevant configuration the frontend must not hardcode. */
export const getConfig = (_req: Request, res: Response): void => {
  res.json({
    chainId: config.blockchain.chainId,
    domain: config.siwe.domain,
    uri: config.siwe.uri,
    statement: config.siwe.statement,
    version: '1',
    nonceTtlSeconds: config.siwe.nonceTtlSeconds,
    siweMaxAgeSeconds: config.siwe.maxAgeSeconds,
    contractAddress: config.blockchain.contractAddress ?? null,
    cookieName: config.cookie.name,
  });
};

export const createNonce = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { address } = NonceRequest.parse(req.body);
    const issued = await nonceService.issue(address);
    res.status(200).json({
      address: checksumAddress(address),
      ...issued,
    });
  } catch (error) {
    next(error);
  }
};

export const verify = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = VerifyRequest.parse(req.body);
    const result = await authService.verify(input, {
      ipAddress: req.clientIp,
      userAgent: req.clientUserAgent,
    });

    setSessionCookie(res, result.token, result.maxAgeSeconds);
    res.status(200).json({
      authenticated: true,
      walletAddress: checksumAddress(result.claims.sub),
      role: result.claims.role,
      jti: result.claims.jti,
      issuedAt: new Date(result.claims.iat * 1000).toISOString(),
      expiresAt: new Date(result.claims.exp * 1000).toISOString(),
    });
  } catch (error) {
    next(error);
  }
};

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const input = VerifyRequest.parse(req.body);
    const result = await registerService.register(input, {
      ipAddress: req.clientIp,
      userAgent: req.clientUserAgent,
    });

    res.status(201).json({
      registered: true,
      walletAddress: checksumAddress(result.walletAddress),
      role: result.role,
    });
  } catch (error) {
    next(error);
  }
};

export const me = (req: Request, res: Response): void => {
  const identity = req.identity;
  if (!identity) throw errors.authRequired();
  res.json({
    authenticated: true,
    walletAddress: checksumAddress(identity.sub),
    role: identity.role,
    jti: identity.jti,
    issuedAt: new Date(identity.iat * 1000).toISOString(),
    expiresAt: new Date(identity.exp * 1000).toISOString(),
  });
};

export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const identity = req.identity;
    if (!identity) throw errors.authRequired();

    const ctx = { ipAddress: req.clientIp, userAgent: req.clientUserAgent };
    const { sessionService } = await import('../services/sessionService');
    await sessionService.revoke(identity.jti, identity.sub, ctx);
    await recordAudit(AuditEvent.LOGOUT, {
      walletAddress: identity.sub,
      ...ctx,
      metadata: { jti: identity.jti },
    });

    res.clearCookie(config.cookie.name, {
      httpOnly: true,
      secure: config.cookie.secure,
      sameSite: 'lax',
      path: '/',
    });
    res.json({ success: true, message: 'Session terminated.' });
  } catch (error) {
    next(error);
  }
};

/**
 * Frontend-reported MetaMask account/chain changes (FR-14/FR-15, FR-16).
 * Informational audit events only - this endpoint grants no privileges.
 */
export const recordClientEvent = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const parsed = EventRequest.parse(req.body);
    await recordAudit(parsed.event, {
      walletAddress: parsed.walletAddress ? parsed.walletAddress.toLowerCase() : null,
      ipAddress: req.clientIp,
      userAgent: req.clientUserAgent,
      metadata: {
        chainId: parsed.chainId,
        detail: parsed.detail,
      },
    });
    res.status(202).json({ accepted: true });
  } catch (error) {
    next(error);
  }
};
