import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Tests share one PostgreSQL instance and one Ganache sender account;
    // run test files sequentially to keep nonce ordering deterministic.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      // Generous per-IP limits so the suite itself is not rate limited;
      // rate limiting has a dedicated test using its own limiter instance.
      RATE_LIMIT_AUTH_MAX: '1000',
      RATE_LIMIT_GENERAL_MAX: '5000',
    },
  },
});
