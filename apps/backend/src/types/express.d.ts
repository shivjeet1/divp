import type { JwtClaims } from '../security/jwt';

declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth() once the session is validated. */
      identity?: JwtClaims;
      requestId?: string;
      clientIp?: string;
      clientUserAgent?: string | null;
    }
  }
}

export {};
