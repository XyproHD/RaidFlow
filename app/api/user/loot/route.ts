import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** GET: Loot-Liste des eingeloggten Users (Lesen, OwnProfile.Loottable). */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session as { userId?: string } | null)?.userId;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const list = await prisma.rfLoot.findMany({
    where: { userId },
    include: {
      guild: { select: { id: true, name: true } },
      dungeon: { select: { id: true, name: true } },
      character: { select: { id: true, name: true } },
    },
    orderBy: { receivedAt: 'desc' },
  });

  return NextResponse.json({
    loot: list.map((l) => ({
      id: l.id,
      itemRef: l.itemRef,
      receivedAt: l.receivedAt,
      guildId: l.guildId,
      guildName: l.guild.name,
      dungeonId: l.dungeonId,
      dungeonName: l.dungeon.name,
      characterId: l.characterId,
      characterName: l.character?.name ?? null,
    })),
  });
}
