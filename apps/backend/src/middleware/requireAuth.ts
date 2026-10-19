import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { AppError } from '../errors/AppError';
import { config } from '../config';
import { sessionService } from '../services/sessionService';

/**
 * requireAuth(): cookie -> JWT verify (sig/alg/iss/aud/iat/exp) ->
 * server-side session state -> optional on-chain re-check ->
 * identity attached to the request.
 */
export function requireAuth(): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    try {
      const token = req.cookies?.[config.cookie.name];
      if (!token) throw new AppError('AUTH_REQUIRED', 401, 'No session cookie was provided.');

      const ctx = { ipAddress: req.clientIp, userAgent: req.clientUserAgent };
      const claims = await sessionService.verify(token, ctx);

      // The contract stays authoritative for *current* authorization: a
      // wallet revoked on-chain after login loses access immediately.
      if (config.session.recheckOnchain) {
        const { authorizationService } = await import('../services/authorizationService');
        try {
          // Use the *live* on-chain role, not the one baked into the JWT at
          // login: a wallet downgraded on-chain must lose the old role on its
          // very next request, not when the token happens to expire.
          const { role: currentRole } = await authorizationService.authorize(claims.sub, ctx);
          claims.role = currentRole;
        } catch (error) {
          if (error instanceof AppError && error.status === 403) {
            // Identity no longer authorized - kill the session too.
            await sessionService.revoke(claims.jti, claims.sub, ctx);
            throw error;
          }
          throw error; // CHAIN_UNAVAILABLE etc. -> controlled 503
        }
      }

      req.identity = claims;
      next();
    } catch (error) {
      next(error);
    }
  };
}

/** Role gate applied after requireAuth(). */
export function requireRole(...roles: Array<'USER' | 'OPERATOR' | 'ADMIN'>): RequestHandler {
  return (req, _res, next) => {
    const identity = req.identity;
    if (!identity) return next(new AppError('AUTH_REQUIRED', 401, 'Authentication is required.'));
    if (!roles.includes(identity.role as 'USER' | 'OPERATOR' | 'ADMIN')) {
      return next(new AppError('ROLE_FORBIDDEN', 403, 'Your role does not permit this operation.'));
    }
    return next();
  };
}
