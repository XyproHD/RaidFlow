import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRaidPlannerForGuild } from '@/lib/raid-planner-auth';
import { logRaidSignupAudit, snapshotSignup } from '@/lib/raid-signup-audit';
import { syncRaidThreadSummary } from '@/lib/raid-thread-sync';

/**
 * PATCH /api/guilds/[guildId]/raids/[raidId]/signups/[signupId]
 * Nur Raidleader/Gildenmeister: Reserve zulassen / Teilnehmer markieren.
 */
export async function PATCH(
  request: NextRequest,
  {
    params,
  }: {
    params: Promise<{ guildId: string; raidId: string; signupId: string }>;
  }
) {
  const { guildId, raidId, signupId } = await params;
  const auth = await requireRaidPlannerForGuild(guildId);
  if (!auth) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const userId = auth.userId;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const signup = await prisma.rfRaidSignup.findFirst({
    where: { id: signupId, raidId, raid: { guildId } },
  });
  if (!signup) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const prevSnap = snapshotSignup(signup);

  const leaderAllowsReserve =
    typeof body.leaderAllowsReserve === 'boolean'
      ? body.leaderAllowsReserve
      : signup.leaderAllowsReserve;
  const leaderMarkedTeilnehmer =
    typeof body.leaderMarkedTeilnehmer === 'boolean'
      ? body.leaderMarkedTeilnehmer
      : signup.leaderMarkedTeilnehmer;

  const updated = await prisma.rfRaidSignup.update({
    where: { id: signupId },
    data: {
      leaderAllowsReserve,
      leaderMarkedTeilnehmer,
    },
    select: {
      id: true,
      leaderAllowsReserve: true,
      leaderMarkedTeilnehmer: true,
    },
  });

  await logRaidSignupAudit({
    signupId: updated.id,
    raidId,
    guildId,
    changedByUserId: userId,
    action: 'leader_signup_update',
    oldValue: prevSnap,
    newValue: snapshotSignup({
      ...signup,
      leaderAllowsReserve: updated.leaderAllowsReserve,
      leaderMarkedTeilnehmer: updated.leaderMarkedTeilnehmer,
    }),
  });

  void syncRaidThreadSummary(raidId);
  return NextResponse.json({ signup: updated });
}
