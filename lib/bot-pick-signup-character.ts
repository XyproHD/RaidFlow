import { prisma } from '@/lib/prisma';

/** Wählt den Anmelde-Charakter: explizite ID oder Main (isMain), sonst alphabetisch erster in der Gilde. */
export async function pickCharacterForRaidSignup(
  userId: string,
  guildId: string,
  characterId: string | null | undefined
) {
  const cid = typeof characterId === 'string' ? characterId.trim() : '';
  if (cid) {
    return prisma.rfCharacter.findFirst({
      where: { id: cid, userId, guildId },
      select: { id: true, mainSpec: true, offSpec: true },
    });
  }
  return prisma.rfCharacter.findFirst({
    where: { userId, guildId },
    orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
    select: { id: true, mainSpec: true, offSpec: true },
  });
}
