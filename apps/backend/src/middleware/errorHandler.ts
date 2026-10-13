import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError';
import { config } from '../config';

/** Maps thrown errors to the structured JSON error contract. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let appError: AppError;

  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof ZodError) {
    appError = new AppError(
      'VALIDATION_ERROR',
      400,
      'Request validation failed.',
      err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  } else {
    // Never leak internals: log server-side, return a generic message.
    console.error(
      `[error] ${req.method} ${req.originalUrl} (${req.requestId ?? '-'}):`,
      err instanceof Error ? (err.stack ?? err.message) : err,
    );
    appError = new AppError('INTERNAL_ERROR', 500, 'An unexpected internal error occurred.');
  }

  const body = appError.toJSON();
  if (!config.isTest) {
    console.warn(
      `[${appError.status}] ${req.method} ${req.originalUrl} -> ${appError.code}: ${appError.message}`,
    );
  }
  res.status(appError.status).json(body);
}

/** 404 for unknown routes, in the same error shape. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `No route matches ${req.method} ${req.path}.`,
  });
}
