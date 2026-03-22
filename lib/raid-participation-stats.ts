import type { PrismaClient } from '@prisma/client';

export type ParticipationXY = { dungeon: number; total: number };

/**
 * x = Summe participation_counter für diesen Dungeon, y = Summe über alle Dungeons (Gilde).
 */
export async function getParticipationStatsForUsers(
  prisma: PrismaClient,
  guildId: string,
  dungeonId: string,
  userIds: string[]
): Promise<Map<string, ParticipationXY>> {
  const out = new Map<string, ParticipationXY>();
  if (userIds.length === 0) return out;
  for (const id of userIds) {
    out.set(id, { dungeon: 0, total: 0 });
  }

  const rows = await prisma.rfRaidCompletion.findMany({
    where: {
      userId: { in: userIds },
      raid: { guildId },
    },
    select: {
      userId: true,
      participationCounter: true,
      raid: { select: { dungeonId: true } },
    },
  });

  for (const r of rows) {
    const cur = out.get(r.userId);
    if (!cur) continue;
    const add = Number(r.participationCounter);
    if (!Number.isFinite(add)) continue;
    cur.total += add;
    if (r.raid.dungeonId === dungeonId) {
      cur.dungeon += add;
    }
  }

  return out;
}
