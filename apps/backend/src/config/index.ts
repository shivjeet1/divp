import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';

/**
 * Environment loading + validation.
 *
 * The repository keeps a single root `.env`. Several launch paths exist
 * (tsx from apps/backend, compiled dist, vitest), so we walk upwards from
 * the current working directory looking for it.
 */
function findRootEnv(): string | undefined {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

const rootEnv = findRootEnv();
if (rootEnv) {
  // dotenv does not overwrite variables that are already set.
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- conditional load in a CommonJS build
  require('dotenv').config({ path: rootEnv });
}

const bool = (defaultValue: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? defaultValue : v === 'true' || v === '1'));

const int = (defaultValue: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? defaultValue : Number(v)))
    .pipe(z.number().int().nonnegative());

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  BACKEND_URL: z.string().url().default('http://localhost:4000'),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  PORT: int(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  RPC_URL: z.string().url().default('http://127.0.0.1:7545'),
  CHAIN_ID: int(1337),
  IDENTITY_CONTRACT_ADDRESS: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : v)),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters - run `npm run setup:env`'),
  JWT_ISSUER: z.string().min(1).default('identity-auth-server'),
  JWT_AUDIENCE: z.string().min(1).default('identity-web-app'),
  JWT_TTL_SECONDS: int(3600),

  SIWE_DOMAIN: z.string().min(1).default('localhost:3000'),
  SIWE_URI: z.string().url().default('http://localhost:3000'),
  SIWE_STATEMENT: z
    .string()
    .min(1)
    .default('Sign in to the Decentralized Identity Verification Pipeline.'),
  NONCE_TTL_SECONDS: int(300),
  SIWE_MAX_AGE_SECONDS: int(300),
  CLOCK_SKEW_SECONDS: int(60),

  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  // Secure-by-default in production: an unset COOKIE_SECURE must never silently
  // downgrade to insecure. Explicit values always win; only the *default* is
  // environment-aware (dev stays insecure for http://localhost).
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => {
      if (v !== undefined && v !== '') return v === 'true' || v === '1';
      return process.env.NODE_ENV === 'production';
    }),
  COOKIE_NAME: z.string().min(1).default('divp_session'),
  COOKIE_MAX_AGE_SECONDS: int(3600),

  RATE_LIMIT_WINDOW_MS: int(60_000),
  RATE_LIMIT_AUTH_MAX: int(30),
  RATE_LIMIT_GENERAL_MAX: int(300),

  SESSION_RECHECK_ONCHAIN: bool(true),
  ADMIN_PRIVATE_KEY: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? undefined : v)),
  CORS_ALLOW_NO_ORIGIN: bool(false),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // Fail closed: never start with a weak/missing configuration.
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const env = parsed.data;

export const config = {
  nodeEnv: env.NODE_ENV,
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,
  appName: process.env.APP_NAME ?? 'Decentralized Identity',

  urls: {
    frontend: env.FRONTEND_URL,
    backend: env.BACKEND_URL,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    allowNoOrigin: env.CORS_ALLOW_NO_ORIGIN,
  },

  database: {
    url: env.DATABASE_URL,
  },

  blockchain: {
    rpcUrl: env.RPC_URL,
    chainId: env.CHAIN_ID,
    contractAddress: env.IDENTITY_CONTRACT_ADDRESS,
  },

  jwt: {
    secret: env.JWT_SECRET,
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    ttlSeconds: env.JWT_TTL_SECONDS,
  },

  siwe: {
    domain: env.SIWE_DOMAIN,
    uri: env.SIWE_URI,
    statement: env.SIWE_STATEMENT,
    nonceTtlSeconds: env.NONCE_TTL_SECONDS,
    maxAgeSeconds: env.SIWE_MAX_AGE_SECONDS,
    clockSkewSeconds: env.CLOCK_SKEW_SECONDS,
  },

  cookie: {
    name: env.COOKIE_NAME,
    secure: env.COOKIE_SECURE,
    maxAgeSeconds: env.COOKIE_MAX_AGE_SECONDS,
  },

  rateLimits: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    authMax: env.RATE_LIMIT_AUTH_MAX,
    generalMax: env.RATE_LIMIT_GENERAL_MAX,
  },

  session: {
    recheckOnchain: env.SESSION_RECHECK_ONCHAIN,
  },

  admin: {
    privateKey: env.ADMIN_PRIVATE_KEY,
  },
} as const;

export type AppConfig = typeof config;
