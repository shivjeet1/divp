import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { adminRegistry } from '../blockchain/adminRegistry';
import { isValidAddress, checksumAddress } from '../utils/address';
import { recordAudit, type AuditEventName } from '../services/auditService';
import { sessionService } from '../services/sessionService';

/**
 * Optional administrative API (PRD section 11). All routes sit behind
 * requireAuth() + requireRole('ADMIN'); the wallet's ADMIN role comes from
 * the on-chain registry, never from the request.
 */
const RoleInput = z.enum(['USER', 'OPERATOR', 'ADMIN']);

const CreateBody = z.object({
  address: z.string().refine(isValidAddress, 'A valid Ethereum address is required.'),
  role: RoleInput,
});

const PatchBody = z.object({
  role: RoleInput,
});

const AddressParam = z.object({
  address: z.string().refine(isValidAddress, 'A valid Ethereum address is required.'),
});

function auditAdmin(
  req: Request,
  action: AuditEventName,
  metadata: Record<string, Prisma.InputJsonValue>,
): void {
  void recordAudit(action, {
    walletAddress: req.identity?.sub,
    ipAddress: req.clientIp,
    userAgent: req.clientUserAgent,
    metadata,
  });
}

export const listIdentities = async (
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const identities = await adminRegistry.listIdentities();
    res.json({
      identities: identities.map((i) => ({
        ...i,
        walletAddress: checksumAddress(i.walletAddress),
      })),
      count: identities.length,
    });
  } catch (error) {
    next(error);
  }
};

export const createIdentity = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { address, role } = CreateBody.parse(req.body);
    await adminRegistry.register(address, role);
    auditAdmin(req, 'IDENTITY_AUTHORIZED', {
      action: 'admin_register',
      address: address.toLowerCase(),
      role,
    });
    res.status(201).json({ created: true, walletAddress: checksumAddress(address), role });
  } catch (error) {
    next(error);
  }
};

export const patchIdentity = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { address } = AddressParam.parse(req.params);
    const { role } = PatchBody.parse(req.body);
    await adminRegistry.setRole(address, role);
    // A role change invalidates the role baked into existing JWTs: kill all of
    // the wallet's active Web2 sessions so they must re-authenticate and pick
    // up the new on-chain role (even with the per-request re-check disabled).
    await sessionService.revokeAllForWallet(address, {
      ipAddress: req.clientIp,
      userAgent: req.clientUserAgent,
    });
    auditAdmin(req, 'IDENTITY_AUTHORIZED', {
      action: 'admin_set_role',
      address: address.toLowerCase(),
      role,
    });
    res.json({ updated: true, walletAddress: checksumAddress(address), role });
  } catch (error) {
    next(error);
  }
};

export const deleteIdentity = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const { address } = AddressParam.parse(req.params);
    await adminRegistry.revoke(address);
    // Revoke the wallet's active Web2 sessions server-side too, so a revoked
    // user loses access immediately rather than until their JWT expires.
    await sessionService.revokeAllForWallet(address, {
      ipAddress: req.clientIp,
      userAgent: req.clientUserAgent,
    });
    auditAdmin(req, 'IDENTITY_REJECTED', {
      action: 'admin_revoke',
      address: address.toLowerCase(),
    });
    res.json({ revoked: true, walletAddress: checksumAddress(address) });
  } catch (error) {
    next(error);
  }
};
