import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRaidPlannerOrForbid } from '@/lib/raid-planner-auth';

const PAGE_SIZE = 8;

function berlinDayStartUtc(fromIso: string | null): Date {
  if (fromIso) {
    const d = new Date(fromIso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return new Date(`${y}-${m}-${d}T00:00:00+02:00`);
}

function raidBaseWhere(guildId: string, excludeRaidId: string | null) {
  return {
    guildId,
    ...(excludeRaidId ? { id: { not: excludeRaidId } } : {}),
  };
}

/**
 * GET — Raids für Vergleichsraid-Auswahl (paginiert ab „heute“ Berlin).
 * Query: excludeRaidId, after (ISO, Fenster ab), before (ISO, Fenster davor)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const { guildId } = await params;
  const auth = await requireRaidPlannerOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const excludeRaidId = searchParams.get('excludeRaidId')?.trim() || null;
  const afterRaw = searchParams.get('after');
  const beforeRaw = searchParams.get('before');
  const locale = searchParams.get('locale')?.trim() || 'de';

  const todayStart = berlinDayStartUtc(null);
  const after = afterRaw ? new Date(afterRaw) : null;
  const before = beforeRaw ? new Date(beforeRaw) : null;
  const baseWhere = raidBaseWhere(guildId, excludeRaidId);

  if (before && !Number.isNaN(before.getTime())) {
    const rows = await prisma.rfRaid.findMany({
      where: {
        ...baseWhere,
        scheduledAt: { lt: before },
      },
      orderBy: { scheduledAt: 'desc' },
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        scheduledAt: true,
        status: true,
        dungeon: {
          select: {
            name: true,
            names: { where: { locale }, take: 1, select: { name: true } },
          },
        },
      },
    });
    const raids = rows.reverse().map((r) => ({
      id: r.id,
      name: r.name,
      scheduledAt: r.scheduledAt.toISOString(),
      status: r.status,
      dungeonLabel: r.dungeon.names[0]?.name ?? r.dungeon.name,
    }));

    const firstAt = raids[0]?.scheduledAt ? new Date(raids[0].scheduledAt) : null;
    const lastAt = raids[raids.length - 1]?.scheduledAt
      ? new Date(raids[raids.length - 1]!.scheduledAt)
      : null;

    const [olderCount, newerCount] = await Promise.all([
      firstAt
        ? prisma.rfRaid.count({
            where: { ...baseWhere, scheduledAt: { lt: firstAt } },
          })
        : Promise.resolve(0),
      lastAt
        ? prisma.rfRaid.count({
            where: { ...baseWhere, scheduledAt: { gt: lastAt, lt: before } },
          })
        : Promise.resolve(0),
    ]);

    return NextResponse.json({
      raids,
      pageSize: PAGE_SIZE,
      cursors: {
        prevBefore: firstAt?.toISOString() ?? before.toISOString(),
        nextAfter: lastAt
          ? new Date(lastAt.getTime() + 1).toISOString()
          : before.toISOString(),
        todayStart: todayStart.toISOString(),
      },
      hasOlder: olderCount > 0,
      hasNewer: newerCount > 0,
    });
  }

  const lower = after && !Number.isNaN(after.getTime()) ? after : todayStart;
  const rows = await prisma.rfRaid.findMany({
    where: {
      ...baseWhere,
      scheduledAt: { gte: lower },
    },
    orderBy: { scheduledAt: 'asc' },
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      scheduledAt: true,
      status: true,
      dungeon: {
        select: {
          name: true,
          names: { where: { locale }, take: 1, select: { name: true } },
        },
      },
    },
  });

  const raids = rows.map((r) => ({
    id: r.id,
    name: r.name,
    scheduledAt: r.scheduledAt.toISOString(),
    status: r.status,
    dungeonLabel: r.dungeon.names[0]?.name ?? r.dungeon.name,
  }));

  const lastAt = raids[raids.length - 1]?.scheduledAt
    ? new Date(raids[raids.length - 1]!.scheduledAt)
    : null;

  const [olderCount, newerCount] = await Promise.all([
    prisma.rfRaid.count({
      where: { ...baseWhere, scheduledAt: { lt: lower } },
    }),
    lastAt
      ? prisma.rfRaid.count({
          where: { ...baseWhere, scheduledAt: { gt: lastAt } },
        })
      : Promise.resolve(0),
  ]);

  return NextResponse.json({
    raids,
    pageSize: PAGE_SIZE,
    cursors: {
      prevBefore: lower.toISOString(),
      nextAfter: lastAt
        ? new Date(lastAt.getTime() + 1).toISOString()
        : lower.toISOString(),
      todayStart: todayStart.toISOString(),
    },
    hasOlder: olderCount > 0,
    hasNewer: newerCount > 0,
  });
}
