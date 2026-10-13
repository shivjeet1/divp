import type { Request, Response, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { AppError } from '../errors/AppError';

/**
 * Rate limiting (SEC-13). Strict limits for authentication endpoints,
 * generous limits elsewhere; both configurable through the environment for
 * production tuning. Responses use the structured error contract.
 */
export function createRateLimiter(
  max: number,
  windowMs = config.rateLimits.windowMs,
): RequestHandler {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
      res
        .status(429)
        .json(
          new AppError(
            'RATE_LIMITED',
            429,
            'Too many requests. Please slow down and try again.',
          ).toJSON(),
        );
    },
  });
}

/** Applied to POST /auth/nonce, /auth/verify and /auth/events. */
export const authRateLimiter = (): RequestHandler => createRateLimiter(config.rateLimits.authMax);

/** Applied globally. */
export const generalRateLimiter = (): RequestHandler =>
  createRateLimiter(config.rateLimits.generalMax);
