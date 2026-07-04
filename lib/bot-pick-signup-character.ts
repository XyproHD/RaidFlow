import { prisma } from '@/lib/prisma';

/** Wählt den Anmelde-Charakter: explizite ID oder Main (isMain), sonst alphabetisch erster in der Gilde. */
export async function pickCharacterForRaidSignup(
  userId: string,
  guildId: string,
  characterId: string | null | undefined,
  options?: { allowUnassigned?: boolean }
) {
  const guildWhere = options?.allowUnassigned
    ? { OR: [{ guildId: null as string | null }, { guildId }] }
    : { guildId };

  const cid = typeof characterId === 'string' ? characterId.trim() : '';
  if (cid) {
    return prisma.rfCharacter.findFirst({
      where: { id: cid, userId, ...guildWhere },
      select: { id: true, name: true, mainSpec: true, offSpec: true },
    });
  }
  return prisma.rfCharacter.findFirst({
    where: { userId, ...guildWhere },
    orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
    select: { id: true, name: true, mainSpec: true, offSpec: true },
  });
}
