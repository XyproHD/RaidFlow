import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { OWNER_DISCORD_ID } from '@/lib/app-config';

export interface AdminSession {
  userId: string;
  discordId: string;
}

/** Geworfen wenn Prisma/DB beim Admin-Check nicht erreichbar ist (sonst Next.js 500 + Digest). */
export class AdminDatabaseError extends Error {
  constructor(cause: unknown) {
    super('Admin database unavailable');
    this.name = 'AdminDatabaseError';
    this.cause = cause;
  }
}

/** Prüft, ob der aktuelle User Application-Admin (Owner oder in AppAdmin) ist. Gibt Session-Infos oder null zurück. */
export async function requireAdmin(): Promise<AdminSession | null> {
  const session = await getServerSession(authOptions);
  const discordId = (session as { discordId?: string } | null)?.discordId;
  if (!discordId) return null;

  try {
    if (discordId === OWNER_DISCORD_ID) {
      const user = await prisma.rfUser.findUnique({ where: { discordId }, select: { id: true } });
      if (!user) return null;
      return { userId: user.id, discordId };
    }

    const adminEntry = await prisma.rfAppAdmin.findUnique({ where: { discordUserId: discordId } });
    if (!adminEntry) return null;

    const user = await prisma.rfUser.findUnique({ where: { discordId }, select: { id: true } });
    if (!user) return null;

    return { userId: user.id, discordId };
  } catch (e) {
    console.error('[requireAdmin] Prisma error', e);
    throw new AdminDatabaseError(e);
  }
}
