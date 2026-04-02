import { PrismaClient } from '@prisma/client';

/**
 * Supabase Connection Pooler: Port **5432** = Session mode (strenges Limit → bei Vercel
 * häufig `MaxClientsInSessionMode`). Port **6543** = Transaction mode (PgBouncer), für
 * Serverless/Lambda geeignet. Ohne diese Anpassung scheitern u. a. Dashboard und
 * `/api/.../raid-planner/bootstrap` mit DB-FATAL.
 *
 * @see https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler
 */
function normalizeSupabasePoolerUrl(urlString: string): string {
  if (!urlString.trim()) return urlString;
  try {
    const u = new URL(urlString);
    if (!u.hostname.includes('pooler.supabase.com')) return urlString;

    const effectivePort = u.port || '5432';
    let portSwitched = false;
    if (effectivePort === '5432') {
      u.port = '6543';
      portSwitched = true;
    }
    if (!u.searchParams.has('pgbouncer')) {
      u.searchParams.set('pgbouncer', 'true');
    }
    if (!u.searchParams.has('connection_limit')) {
      u.searchParams.set('connection_limit', '1');
    }

    if (portSwitched) {
      console.warn(
        '[prisma] Supabase Pooler: Session-Port 5432 → Transaction-Port 6543 (pgbouncer). Prüfe DATABASE_URL in Vercel (.env.example).'
      );
    }
    return u.toString();
  } catch {
    return urlString;
  }
}

const rawDatabaseUrl = process.env.DATABASE_URL;
const databaseUrl = rawDatabaseUrl ? normalizeSupabasePoolerUrl(rawDatabaseUrl) : '';

/**
 * Ein Client pro Runtime (auch Production / Vercel): vermeidet zusätzliche Pool-Verbindungen
 * bei warmen Serverless-Instanzen. Ohne globalThis würde HMR in Dev mehrfach instanziieren.
 */
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient(
    rawDatabaseUrl
      ? {
          datasources: {
            db: { url: databaseUrl },
          },
        }
      : undefined
  );

globalForPrisma.prisma = prisma;
