import { createApp } from './app';
import { config } from './config';
import { prisma } from './prisma';
import { assertChainConfig } from './blockchain/registry';

/**
 * Entry point: runs fail-fast startup checks (database reachable, chain id
 * matches the running node, contract bytecode present) before accepting
 * traffic, then starts the HTTP server.
 */
async function main(): Promise<void> {
  // 1. Database
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('[startup] PostgreSQL: reachable');
  } catch (error) {
    console.error(
      '[startup] PostgreSQL is unreachable:',
      (error as Error).message,
      '\n  -> Start it with `docker compose up -d` and check DATABASE_URL in .env',
    );
    process.exit(1);
  }

  // 2. Blockchain configuration vs. the actually running node
  try {
    await assertChainConfig();
    console.log(
      `[startup] Chain: ${config.blockchain.chainId} @ ${config.blockchain.rpcUrl}, contract ${config.blockchain.contractAddress ?? '(not set)'}`,
    );
  } catch (error) {
    console.error(
      '[startup] Blockchain check failed:',
      (error as Error).message,
      '\n  -> Start Ganache with `npm run chain` and deploy with `npm run deploy:contract`',
    );
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`[startup] Identity auth API listening on ${config.urls.backend}`);
    console.log(`[startup] CORS origins: ${config.urls.corsOrigins.join(', ')}`);
    console.log(
      `[startup] Cookie: ${config.cookie.name} httpOnly=${true} sameSite=lax secure=${config.cookie.secure}`,
    );
    if (config.isProduction && !config.cookie.secure) {
      console.warn('[startup] WARNING: COOKIE_SECURE=false in production - set it to true.');
    }
  });

  const shutdown = (signal: string) => {
    console.log(`[shutdown] ${signal} received`);
    server.close(() => {
      prisma.$disconnect().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error) => {
  console.error('[startup] fatal:', error);
  process.exit(1);
});
