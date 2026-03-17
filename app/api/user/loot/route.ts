import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

/** GET: Loot-Liste des eingeloggten Users (Lesen, OwnProfile.Loottable). Query: page=1, limit=20 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, parseInt(searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE)
  );
  const skip = (page - 1) * limit;

  const [list, totalCount] = await Promise.all([
    prisma.rfLoot.findMany({
      where: { userId },
      include: {
        guild: { select: { id: true, name: true } },
        dungeon: { select: { id: true, name: true } },
        character: { select: { id: true, name: true } },
      },
      orderBy: { receivedAt: 'desc' },
      take: limit,
      skip,
    }),
    prisma.rfLoot.count({ where: { userId } }),
  ]);

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
    totalCount,
    page,
    limit,
  });
}
