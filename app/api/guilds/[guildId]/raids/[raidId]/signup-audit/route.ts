import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { prisma } from '@/lib/prisma';
import { requireRaidPlannerForGuild } from '@/lib/raid-planner-auth';

/**
 * GET /api/guilds/[guildId]/raids/[raidId]/signup-audit
 * Chronologische Audit-Einträge zu Anmeldungen dieses Raids (nur Raidleader/Gildenmeister).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ guildId: string; raidId: string }> }
) {
  const { guildId, raidId } = await params;
  const auth = await requireRaidPlannerForGuild(guildId);
  if (!auth) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await getEffectiveUserId(
    session as { userId?: string; discordId?: string }
  );
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raid = await prisma.rfRaid.findFirst({
    where: { id: raidId, guildId },
    select: { id: true },
  });
  if (!raid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rows = await prisma.rfAuditLog.findMany({
    where: {
      raidId,
      entityType: 'raid_signup',
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
    select: {
      id: true,
      entityId: true,
      action: true,
      fieldName: true,
      oldValue: true,
      newValue: true,
      changedByUserId: true,
      createdAt: true,
    },
  });

  const userIds = [...new Set(rows.map((r) => r.changedByUserId))];
  const users = await prisma.rfUser.findMany({
    where: { id: { in: userIds } },
    select: { id: true, discordId: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u.discordId]));

  return NextResponse.json({
    entries: rows.map((r) => ({
      ...r,
      changedByDiscordId: userMap.get(r.changedByUserId) ?? null,
    })),
  });
}
