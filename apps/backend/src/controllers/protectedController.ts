import type { Request, Response } from 'express';
import { checksumAddress } from '../utils/address';

/** GET /api/protected - requires a valid session (requireAuth). */
export const protectedResource = (req: Request, res: Response): void => {
  const identity = req.identity!;
  res.json({
    authenticated: true,
    walletAddress: checksumAddress(identity.sub),
    role: identity.role,
    jti: identity.jti,
    message: 'You accessed a protected Web2 resource with a Web3-derived session.',
    serverTime: new Date().toISOString(),
  });
};

/** GET /api/protected/operator - OPERATOR or ADMIN. */
export const operatorResource = (req: Request, res: Response): void => {
  const identity = req.identity!;
  res.json({
    authenticated: true,
    walletAddress: checksumAddress(identity.sub),
    role: identity.role,
    message: 'Operator-level resource accessed.',
  });
};

/** GET /api/protected/admin - ADMIN only. */
export const adminResource = (req: Request, res: Response): void => {
  const identity = req.identity!;
  res.json({
    authenticated: true,
    walletAddress: checksumAddress(identity.sub),
    role: identity.role,
    message: 'Admin-level resource accessed.',
  });
};
