import { config } from '../config';
import { AppError } from '../errors/AppError';
import { parseSiweMessage, validateSiwePolicy } from '../siwe/parser';
import { assertSignerMatches, recoverSigner } from './signatureService';
import { nonceService } from './nonceService';
import { adminRegistry } from '../blockchain/adminRegistry';
import { AuditEvent, recordAudit } from './auditService';
import { normalizeAddress } from '../utils/address';
import { authorizationService, type AuthorizationContext } from './authorizationService';

export interface RegisterInput {
  message: unknown;
  signature: unknown;
}

/**
 * Self-service identity registration with proof of ownership.
 *
 * A visitor who is not yet in the on-chain registry can register their own
 * wallet. To prevent claiming arbitrary addresses, they must sign a SIWE
 * message whose recovered signer is exactly the address being registered -
 * the same cryptographic proof used for sign-in, minus the authorization
 * step. The on-chain write is signed by the admin key (fail-closed if unset).
 *
 * The wallet is always registered with the least-privileged role, USER.
 * Elevation to OPERATOR/ADMIN remains an explicit admin action.
 */
export const registerService = {
  async register(
    input: RegisterInput,
    ctx: AuthorizationContext & { ipAddress?: string | null; userAgent?: string | null },
  ): Promise<{ walletAddress: string; role: 'USER' }> {
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

      // 4. Recover signer from the exact message bytes and compare (SEC-05).
      //    This is what proves the requester owns the address - they cannot
      //    register a wallet whose private key they do not control.
      const recovered = recoverSigner(message.raw, input.signature);
      assertSignerMatches(message.address, recovered);

      // 5. Atomically consume the nonce (replay protection).
      await nonceService.consume(message.nonce, message.address);

      const wallet = normalizeAddress(message.address);

      // 6. Self-registration is only for wallets never seen before. A wallet
      //    that is already known — active OR revoked — must NOT be able to
      //    (re)activate itself here; that is an explicit admin action. The
      //    contract only blocks re-registration of *active* identities, so
      //    without this check a revoked user could bypass revocation.
      const known = await authorizationService.getIdentityState(message.address);
      if (known.registered) {
        throw new AppError(
          'ALREADY_REGISTERED',
          403,
          'This wallet is already known to the system. Contact an admin to restore access.',
        );
      }

      // 7. Register on-chain with the least-privileged role. The admin key
      //    signs the transaction; adminRegistry fails closed if it is unset.
      await adminRegistry.register(wallet, 'USER');

      await recordAudit(AuditEvent.IDENTITY_AUTHORIZED, {
        walletAddress: wallet,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { action: 'self_register', role: 'USER' },
      });

      return { walletAddress: wallet, role: 'USER' };
    } catch (error) {
      const code = error instanceof AppError ? error.code : 'INTERNAL_ERROR';
      await recordAudit(AuditEvent.SIGNATURE_VERIFICATION_FAILED, {
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: { reason: code, context: 'self_register' },
      });
      throw error;
    }
  },
};
