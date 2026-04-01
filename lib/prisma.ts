import { PrismaClient } from '@prisma/client';

/**
 * Ein Client pro Runtime (auch Production / Vercel): vermeidet zusätzliche Pool-Verbindungen
 * bei warmen Serverless-Instanzen. Ohne globalThis würde HMR in Dev mehrfach instanziieren.
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

globalForPrisma.prisma = prisma;
