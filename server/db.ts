import { PrismaClient } from '@prisma/client';

/** Shared Prisma client. Single instance for the process. */
export const prisma = new PrismaClient();
