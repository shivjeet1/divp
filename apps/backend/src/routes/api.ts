import { Router } from 'express';
import {
  protectedResource,
  operatorResource,
  adminResource,
} from '../controllers/protectedController';
import {
  createIdentity,
  deleteIdentity,
  listIdentities,
  patchIdentity,
} from '../controllers/adminController';
import { requireAuth, requireRole } from '../middleware/requireAuth';

export const apiRouter: Router = Router();

// Authenticated Web2 resources
apiRouter.get('/api/protected', requireAuth(), protectedResource);
apiRouter.get(
  '/api/protected/operator',
  requireAuth(),
  requireRole('OPERATOR', 'ADMIN'),
  operatorResource,
);
apiRouter.get('/api/protected/admin', requireAuth(), requireRole('ADMIN'), adminResource);

// Administrative identity management (optional per PRD)
apiRouter.get('/admin/identities', requireAuth(), requireRole('ADMIN'), (req, res, next) => {
  listIdentities(req, res, next).catch(next);
});
apiRouter.post('/admin/identities', requireAuth(), requireRole('ADMIN'), (req, res, next) => {
  createIdentity(req, res, next).catch(next);
});
apiRouter.patch(
  '/admin/identities/:address',
  requireAuth(),
  requireRole('ADMIN'),
  (req, res, next) => {
    patchIdentity(req, res, next).catch(next);
  },
);
apiRouter.delete(
  '/admin/identities/:address',
  requireAuth(),
  requireRole('ADMIN'),
  (req, res, next) => {
    deleteIdentity(req, res, next).catch(next);
  },
);
