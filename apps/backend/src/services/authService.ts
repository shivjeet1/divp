import { prisma } from '../prisma';
import { config } from '../config';
import { AppError } from '../errors/AppError';
import { parseSiweMessage, validateSiwePolicy } from '../siwe/parser';
import { assertSignerMatches, recoverSigner } from './signatureService';
import { nonceService } from './nonceService';
import { authorizationService, type AuthorizationContext } from './authorizationService';
import { sessionService, type CreatedSession } from './sessionService';
import { AuditEvent, recordAudit } from './auditService';
import { normalizeAddress } from '../utils/address';
import type { JwtClaims } from '../security/jwt';

export interface VerifyInput {
  message: unknown;
  signature: unknown;
}

export interface VerifyResult extends CreatedSession {
  claims: JwtClaims;
}

/**
 * POST /auth/verify pipeline (FR-06, Phase 6).
 *
 * Receive -> parse -> structure -> domain -> URI -> version -> chain ->
 * timestamps -> nonce lookup/ownership -> signature recovery -> signer
 * comparison -> atomic nonce consumption -> on-chain authorization ->
 * session creation.
 *
 * Every stage throws on failure and the pipeline stops immediately.
 */
export const authService = {
  async verify(
    input: VerifyInput,
    ctx: AuthorizationContext & { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<VerifyResult> {
    await recordAudit(AuditEvent.SIGNATURE_VERIFICATION_STARTED, {
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    });

    try {
      // 1. Parse (throws SIWE_MALFORMED)
      const message = parseSiweMessage(input.message);

      // 2. Validate security-critical fields against server policy
      validateSiwePolicy(message, {
        domain: config.siwe.domain,
        uri: config.siwe.uri,
        chainId: config.blockchain.chainId,
        maxAgeSeconds: config.siwe.maxAgeSeconds,
        clockSkewSeconds: config.siwe.clockSkewSeconds,
        requireExpiration: true,
      });

      // 3. Nonce: exists, bound to this wallet, unused, unexpired
      await nonceService.lookup(message.nonce, message.address);

      // 4. Recover signer from the exact message bytes and compare (SEC-05)
      const recovered = recoverSigner(message.raw, input.signature);
      assertSignerMatches(message.address, recovered);

      // 5. Atomically consume the nonce (SEC-01 replay protection).
      //    Of two concurrent identical attempts exactly one proceeds.
      await nonceService.consume(message.nonce, message.address);

      await recordAudit(AuditEvent.SIGNATURE_VERIFIED, {
        walletAddress: normalizeAddress(message.address),
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { chainId: message.chainId, domain: message.domain },
      });

      // 6. On-chain authorization (FR-07) - contract is authoritative
      const { role } = await authorizationService.authorize(message.address, ctx);

      // 7. Ensure local user metadata exists
      const wallet = normalizeAddress(message.address);
      await prisma.user.upsert({
        where: { walletAddress: wallet },
        update: {},
        create: { walletAddress: wallet },
      });

      // 8. Create the Web2 session (JWT + server-side record)
      return sessionService.create(wallet, role, ctx);
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
      await recordAudit(AuditEvent.SIGNATURE_VERIFICATION_FAILED, {
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { reason: code },
      });
      throw error;
    }
  },
};
