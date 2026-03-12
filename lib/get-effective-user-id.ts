import { prisma } from '@/lib/prisma';

type SessionLike = { userId?: string; discordId?: string } | null;

/**
 * Liefert die rf_user.id für die Session. Wenn session.userId keine gültige User-ID
 * ist (z. B. alte Session mit Discord-ID statt DB-UUID), wird der User per discordId
 * ermittelt bzw. angelegt. Behebt Foreign-Key-Fehler bei Character/Raidzeiten.
 */
export async function getEffectiveUserId(session: SessionLike): Promise<string | null> {
  if (!session || typeof session !== 'object') return null;
  const discordId = typeof session.discordId === 'string' ? session.discordId : undefined;
  const candidateId = typeof session.userId === 'string' ? session.userId : undefined;

  try {
    if (candidateId) {
      const user = await prisma.rfUser.findUnique({ where: { id: candidateId } });
      if (user) return user.id;
    }

    if (discordId) {
      const user = await prisma.rfUser.upsert({
        where: { discordId },
        create: { discordId },
        update: { updatedAt: new Date() },
      });
      return user.id;
    }
  } catch (e) {
    console.error('[getEffectiveUserId]', e);
    return null;
  }

  return null;
}
