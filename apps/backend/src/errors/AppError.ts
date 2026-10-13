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
  | 'METHOD_NOT_ALLOWED'
  | 'RATE_LIMITED'
  | 'ORIGIN_NOT_ALLOWED'
  | 'INTERNAL_ERROR'
  | 'SERVICE_UNAVAILABLE'
  // nonce / siwe
  | 'INVALID_ADDRESS'
  | 'NONCE_NOT_FOUND'
  | 'NONCE_ALREADY_USED'
  | 'NONCE_EXPIRED'
  | 'SIWE_MALFORMED'
  | 'SIWE_DOMAIN_MISMATCH'
  | 'SIWE_URI_MISMATCH'
  | 'SIWE_VERSION_MISMATCH'
  | 'SIWE_CHAIN_MISMATCH'
  | 'SIWE_EXPIRED'
  | 'SIWE_ISSUED_AT_INVALID'
  | 'SIWE_NONCE_MISMATCH'
  | 'SIWE_ADDRESS_MISMATCH'
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
  | 'TOKEN_MISSING'
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

export const errors = {
  validation: (message = 'Request validation failed.', details?: unknown) =>
    new AppError('VALIDATION_ERROR', 400, message, details),
  invalidAddress: (message = 'The wallet address is not a valid Ethereum address.') =>
    new AppError('INVALID_ADDRESS', 400, message),
  authRequired: (message = 'Authentication is required.') =>
    new AppError('AUTH_REQUIRED', 401, message),
  forbidden: (message = 'Your role does not permit this operation.') =>
    new AppError('ROLE_FORBIDDEN', 403, message),
  notFound: (message = 'Resource not found.') => new AppError('NOT_FOUND', 404, message),
  rateLimited: () =>
    new AppError('RATE_LIMITED', 429, 'Too many requests. Please slow down and try again.'),
  originNotAllowed: () => new AppError('ORIGIN_NOT_ALLOWED', 403, 'Request origin is not allowed.'),
  internal: (message = 'An unexpected internal error occurred.') =>
    new AppError('INTERNAL_ERROR', 500, message),
  unavailable: (code: ErrorCode, message: string) => new AppError(code, 503, message),
};
