import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRaidPlannerForGuild } from '@/lib/raid-planner-auth';
import { logRaidSignupAudit, snapshotSignup } from '@/lib/raid-signup-audit';
import { syncRaidThreadSummary } from '@/lib/raid-thread-sync';
import {
  parseLeaderPlacement,
  setConfirmedForPlacement,
  type LeaderPlacement,
} from '@/lib/raid-leader-placement';

function validateSignedSpec(
  signedSpec: string,
  mainSpec: string,
  offSpec: string | null
): boolean {
  const s = signedSpec.trim();
  if (s === mainSpec.trim()) return true;
  if (offSpec && s === offSpec.trim()) return true;
  return false;
}

/**
 * PATCH /api/guilds/[guildId]/raids/[raidId]/signups/[signupId]
 * Raidleader: Reserve / Teilnehmer; Spalten (leaderPlacement); Spec wechseln.
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
    include: {
      character: {
        select: { mainSpec: true, offSpec: true },
      },
    },
  });
  if (!signup) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const raid = await prisma.rfRaid.findFirst({
    where: { id: raidId, guildId },
    select: { status: true },
  });
  if (!raid || raid.status !== 'open') {
    return NextResponse.json({ error: 'Raid is not open' }, { status: 403 });
  }

  const prevSnap = snapshotSignup(signup);

  const leaderAllowsReserve =
    typeof body.leaderAllowsReserve === 'boolean'
      ? body.leaderAllowsReserve
      : signup.leaderAllowsReserve;
  const effectiveLeaderAllowsReserve = signup.forbidReserve ? false : leaderAllowsReserve;
  const leaderMarkedTeilnehmer =
    typeof body.leaderMarkedTeilnehmer === 'boolean'
      ? body.leaderMarkedTeilnehmer
      : signup.leaderMarkedTeilnehmer;

  let leaderPlacement: LeaderPlacement =
    parseLeaderPlacement(signup.leaderPlacement) ?? 'signup';
  if (body.leaderPlacement !== undefined) {
    const p = parseLeaderPlacement(body.leaderPlacement);
    if (!p) {
      return NextResponse.json({ error: 'Invalid leaderPlacement' }, { status: 400 });
    }
    leaderPlacement = p;
  }

  let signedSpec = signup.signedSpec ?? '';
  const mainSpec = signup.character?.mainSpec ?? '';
  const offSpec = signup.character?.offSpec ?? null;

  if (body.cycleSignedSpec === true) {
    if (signup.onlySignedSpec) {
      return NextResponse.json(
        { error: 'Spec is locked by signup condition' },
        { status: 400 }
      );
    }
    if (!offSpec?.trim()) {
      return NextResponse.json({ error: 'No off spec to cycle' }, { status: 400 });
    }
    const cur = signedSpec.trim();
    if (cur === mainSpec.trim()) {
      signedSpec = offSpec.trim();
    } else if (cur === offSpec.trim()) {
      signedSpec = mainSpec.trim();
    } else {
      signedSpec = mainSpec.trim();
    }
  } else if (typeof body.signedSpec === 'string') {
    if (signup.onlySignedSpec && body.signedSpec.trim() !== (signup.signedSpec ?? '').trim()) {
      return NextResponse.json(
        { error: 'Spec is locked by signup condition' },
        { status: 400 }
      );
    }
    signedSpec = body.signedSpec.trim();
  }

  if (signup.forbidReserve) {
    if (signup.type === 'reserve') {
      return NextResponse.json(
        { error: 'Reserve is forbidden by signup condition' },
        { status: 400 }
      );
    }
  }

  if (signup.character) {
    if (
      !validateSignedSpec(signedSpec, signup.character.mainSpec, signup.character.offSpec)
    ) {
      return NextResponse.json({ error: 'Invalid signedSpec for character' }, { status: 400 });
    }
  }

  const setConfirmed = setConfirmedForPlacement(leaderPlacement);

  const updated = await prisma.rfRaidSignup.update({
    where: { id: signupId },
    data: {
      leaderAllowsReserve: effectiveLeaderAllowsReserve,
      leaderMarkedTeilnehmer,
      leaderPlacement,
      setConfirmed,
      signedSpec: signedSpec || undefined,
    },
    select: {
      id: true,
      leaderAllowsReserve: true,
      leaderMarkedTeilnehmer: true,
      leaderPlacement: true,
      setConfirmed: true,
      signedSpec: true,
      type: true,
      characterId: true,
      userId: true,
    },
  });

  await logRaidSignupAudit({
    signupId: updated.id,
    raidId,
    guildId,
    changedByUserId: userId,
    action: 'leader_signup_update',
    oldValue: prevSnap,
    newValue: snapshotSignup(updated),
  });

  void syncRaidThreadSummary(raidId);
  return NextResponse.json({ signup: updated });
}
