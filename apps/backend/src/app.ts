import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config';
import { requestContext, originCheck } from './middleware/requestContext';
import { generalRateLimiter } from './middleware/rateLimit';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { apiRouter } from './routes/api';

/** Builds the Express application (exported for tests). */
export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  // We are not behind a reverse proxy by default: req.ip is the real peer.
  // (If you deploy behind a proxy, enable trust proxy explicitly.)
  app.set('trust proxy', false);

  app.use(helmet());

  // Strict CORS allowlist with credentialed responses - never `*`.
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin) return callback(null, true); // non-browser client
        callback(null, config.urls.corsOrigins.includes(origin));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Origin'],
      maxAge: 600,
    }),
  );

  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use(requestContext);
  app.use(originCheck);
  app.use(generalRateLimiter());

  app.use(authRouter);
  app.use(apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
