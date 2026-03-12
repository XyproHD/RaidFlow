import { prisma } from '@/lib/prisma';

type SessionLike = { userId?: string; discordId?: string } | null;

/**
 * Liefert die rf_user.id für die Session. Wenn session.userId keine gültige User-ID
 * ist (z. B. alte Session mit Discord-ID statt DB-UUID), wird der User per discordId
 * ermittelt bzw. angelegt. Behebt Foreign-Key-Fehler bei Character/Raidzeiten.
 */
export async function getEffectiveUserId(session: SessionLike): Promise<string | null> {
  if (!session) return null;
  const discordId = session.discordId;
  const candidateId = session.userId;

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

  return null;
}
