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

/**
 * GET — Raids für Vergleichsraid-Auswahl (paginiert ab „heute“ Berlin).
 * Query: excludeRaidId, after (ISO, exclusive lower bound), before (ISO, exclusive upper bound für Rückwärts-Seite)
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
  const after = afterRaw ? new Date(afterRaw) : todayStart;
  const before = beforeRaw ? new Date(beforeRaw) : null;

  if (before && !Number.isNaN(before.getTime())) {
    const rows = await prisma.rfRaid.findMany({
      where: {
        guildId,
        ...(excludeRaidId ? { id: { not: excludeRaidId } } : {}),
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
    const prevBefore =
      raids.length > 0 ? raids[0]!.scheduledAt : before.toISOString();
    const nextAfter =
      raids.length > 0 ? raids[raids.length - 1]!.scheduledAt : before.toISOString();
    return NextResponse.json({
      raids,
      pageSize: PAGE_SIZE,
      cursors: {
        prevBefore,
        nextAfter,
        todayStart: todayStart.toISOString(),
      },
      hasOlder: raids.length === PAGE_SIZE,
      hasNewer: before.getTime() > todayStart.getTime() + 1,
    });
  }

  const lower = Number.isNaN(after.getTime()) ? todayStart : after;
  const rows = await prisma.rfRaid.findMany({
    where: {
      guildId,
      ...(excludeRaidId ? { id: { not: excludeRaidId } } : {}),
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

  const last = raids[raids.length - 1];
  return NextResponse.json({
    raids,
    pageSize: PAGE_SIZE,
    cursors: {
      prevBefore: lower.toISOString(),
      nextAfter: last ? last.scheduledAt : lower.toISOString(),
      todayStart: todayStart.toISOString(),
    },
    hasOlder: lower.getTime() > todayStart.getTime(),
    hasNewer: raids.length === PAGE_SIZE,
  });
}
