import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { randomBytes } from 'crypto';
import { config } from '../config';
import { AppError } from '../errors/AppError';

/** Attaches a request id and normalized client context to every request. */
export const requestContext: RequestHandler = (req, _res, next) => {
  req.requestId = randomBytes(8).toString('hex');
  // Without a configured reverse proxy, req.ip is the real peer address.
  // X-Forwarded-For is deliberately NOT trusted (it is trivially spoofable).
  req.clientIp = req.ip ?? 'unknown';
  req.clientUserAgent = req.header('user-agent') ?? null;
  next();
};

/**
 * Origin verification for state-changing requests (CSRF defense, SEC-11).
 *
 * Decision (documented in docs/threat-model.md):
 *  - Cookies are SameSite=Lax, which already blocks cross-site POSTs from
 *    carrying the session cookie.
 *  - On top of that, every mutating request must present an Origin (or
 *    Referer) header that is on the strict allowlist. A browser always
 *    sends Origin on cross-origin state-changing requests, so an attacker
 *    page cannot satisfy this check.
 *  - Non-browser clients (tests, curl) must send the header explicitly.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function safeOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

export const originCheck: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.path === '/health') return next();

  const origin = req.header('origin');
  const referer = req.header('referer');
  const source = origin ?? (referer ? safeOrigin(referer) : undefined);

  if (!source) {
    if (config.urls.allowNoOrigin) return next();
    return next(
      new AppError(
        'ORIGIN_NOT_ALLOWED',
        403,
        'State-changing requests must include a valid Origin header.',
      ),
    );
  }

  if (!config.urls.corsOrigins.includes(source)) {
    return next(new AppError('ORIGIN_NOT_ALLOWED', 403, 'Request origin is not allowed.'));
  }
  return next();
};
