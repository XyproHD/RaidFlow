import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRaidPlannerOrForbid } from '@/lib/raid-planner-auth';
import { buildComparisonPlacementByUserId } from '@/lib/planner-comparison';

/** GET — Vergleichs-Platzierung pro User-ID für einen anderen Raid derselben Gilde. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ guildId: string; raidId: string }> }
) {
  const { guildId, raidId } = await params;
  const auth = await requireRaidPlannerOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  const raid = await prisma.rfRaid.findFirst({
    where: { id: raidId, guildId },
    select: {
      status: true,
      draftPlannerGroupsJson: true,
      announcedPlannerGroupsJson: true,
      signups: {
        select: {
          id: true,
          userId: true,
          type: true,
          leaderPlacement: true,
          setConfirmed: true,
        },
      },
    },
  });

  if (!raid) {
    return NextResponse.json({ error: 'Raid not found' }, { status: 404 });
  }

  const byUserId = buildComparisonPlacementByUserId(
    raid.signups,
    raid.draftPlannerGroupsJson,
    raid.announcedPlannerGroupsJson,
    raid.status
  );

  return NextResponse.json({
    placements: Object.fromEntries(byUserId.entries()),
  });
}
