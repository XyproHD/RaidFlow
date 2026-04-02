import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET: Raidstatistik des Users (aggregiert aus RaidCompletion).
 * Je Dungeon, je Gilde: Summe participation_counter.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session as { userId?: string } | null)?.userId;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Optimierung: nur die benötigten Felder laden (keine komplette Completion-Liste) und in-memory aggregieren.
  // Relation-GroupBy (guildId/dungeonId über raid) ist in Prisma nicht trivial; daher: schlanker Select + Aggregation.
  const completions = await prisma.rfRaidCompletion.findMany({
    where: { userId },
    select: {
      participationCounter: true,
      raid: {
        select: {
          guildId: true,
          dungeonId: true,
          guild: { select: { name: true } },
          dungeon: { select: { name: true } },
        },
      },
    },
  });

  const byKey = new Map<
    string,
    { guildId: string; guildName: string; dungeonId: string; dungeonName: string; participationCount: number }
  >();
  for (const c of completions) {
    const key = `${c.raid.guildId}:${c.raid.dungeonId}`;
    const current = byKey.get(key);
    const add = Number(c.participationCounter);
    if (current) current.participationCount += add;
    else
      byKey.set(key, {
        guildId: c.raid.guildId,
        guildName: c.raid.guild.name,
        dungeonId: c.raid.dungeonId,
        dungeonName: c.raid.dungeon.name,
        participationCount: add,
      });
  }

  const stats = Array.from(byKey.values()).sort(
    (a, b) => a.guildName.localeCompare(b.guildName) || a.dungeonName.localeCompare(b.dungeonName)
  );
  return NextResponse.json({ stats });
}
