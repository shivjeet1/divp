import type { Request, Response, NextFunction } from 'express';
import { Router } from 'express';
import {
  createNonce,
  getConfig,
  healthController,
  logout,
  me,
  recordClientEvent,
  register,
  verify,
} from '../controllers/authController';
import { authRateLimiter } from '../middleware/rateLimit';
import { requireAuth } from '../middleware/requireAuth';

export const authRouter: Router = Router();

// Public
authRouter.get('/health', (req: Request, res: Response, next: NextFunction) => {
  healthController(req, res).catch(next);
});
authRouter.get('/auth/config', getConfig);
authRouter.post('/auth/nonce', authRateLimiter(), (req, res, next) => {
  createNonce(req, res, next).catch(next);
});
authRouter.post('/auth/verify', authRateLimiter(), (req, res, next) => {
  verify(req, res, next).catch(next);
});
authRouter.post('/auth/register', authRateLimiter(), (req, res, next) => {
  register(req, res, next).catch(next);
});
authRouter.post('/auth/events', authRateLimiter(), (req, res, next) => {
  recordClientEvent(req, res, next).catch(next);
});

// Session-scoped
authRouter.get('/auth/me', requireAuth(), (req, res) => me(req, res));
authRouter.post('/auth/logout', requireAuth(), (req, res, next) => {
  logout(req, res, next).catch(next);
});
