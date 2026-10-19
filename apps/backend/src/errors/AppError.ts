/**
 * Structured, client-safe application errors.
 *
 * Every error carries a stable machine-readable code, an HTTP status and a
 * safe human message. Internal details never leave the process.
 */
export type ErrorCode =
  // generic
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'ORIGIN_NOT_ALLOWED'
  | 'INTERNAL_ERROR'
  // nonce / siwe
  | 'NONCE_NOT_FOUND'
  | 'NONCE_ALREADY_USED'
  | 'NONCE_EXPIRED'
  | 'SIWE_MALFORMED'
  | 'SIWE_DOMAIN_MISMATCH'
  | 'SIWE_URI_MISMATCH'
  | 'SIWE_CHAIN_MISMATCH'
  | 'SIWE_EXPIRED'
  | 'SIWE_ISSUED_AT_INVALID'
  | 'SIWE_NONCE_MISMATCH'
  | 'SIGNATURE_INVALID'
  | 'SIGNATURE_MALFORMED'
  // authorization
  | 'IDENTITY_NOT_REGISTERED'
  | 'IDENTITY_INACTIVE'
  | 'IDENTITY_ROLE_INVALID'
  | 'CHAIN_UNAVAILABLE'
  | 'CONTRACT_NOT_CONFIGURED'
  // session / jwt
  | 'AUTH_REQUIRED'
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_SIGNATURE_INVALID'
  | 'TOKEN_CLAIM_INVALID'
  | 'SESSION_NOT_FOUND'
  | 'SESSION_REVOKED'
  | 'SESSION_EXPIRED'
  | 'ROLE_FORBIDDEN'
  // admin
  | 'ADMIN_SIGNER_NOT_CONFIGURED'
  | 'ADMIN_TX_FAILED'
  // registration
  | 'ALREADY_REGISTERED';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ErrorCode, status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    };
  }
}
