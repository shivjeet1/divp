import { PrismaClient } from '@prisma/client';

/**
 * Shared Prisma client. Instantiating once avoids connection-pool blowup
 * under `tsx watch` and test runners.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'test' ? ['error'] : ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
