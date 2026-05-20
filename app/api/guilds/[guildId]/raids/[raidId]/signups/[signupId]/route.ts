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
import {
  resolveAnnouncedSignupType,
  setConfirmedForAnnouncedPlacement,
} from '@/lib/raid-announce';
import { parseUnsetPlayersMode } from '@/lib/planner-unset-policy';
import {
  displayNameForSignupRow,
  jsonSignupValidationError,
} from '@/lib/raid-signup-api-errors';

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
        select: {
          name: true,
          guildDiscordDisplayName: true,
          mainSpec: true,
          offSpec: true,
        },
      },
    },
  });
  if (!signup) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const signupDisplayName = displayNameForSignupRow(signup);

  const raid = await prisma.rfRaid.findFirst({
    where: { id: raidId, guildId },
    select: { status: true },
  });
  if (!raid || raid.status === 'completed' || raid.status === 'cancelled') {
    return NextResponse.json({ error: 'Raid is not open for planning' }, { status: 403 });
  }
  if (raid.status !== 'open' && raid.status !== 'announced' && raid.status !== 'locked') {
    return NextResponse.json({ error: 'Raid is not open for planning' }, { status: 403 });
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
      return jsonSignupValidationError('Spec is locked by signup condition', 400, [
        { signupId, displayName: signupDisplayName },
      ]);
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
      return jsonSignupValidationError('Spec is locked by signup condition', 400, [
        { signupId, displayName: signupDisplayName },
      ]);
    }
    signedSpec = body.signedSpec.trim();
  }

  const unsetPlayersMode = parseUnsetPlayersMode(body.unsetPlayersMode);
  const usesAnnouncedPlacementRules =
    raid.status === 'announced' || raid.status === 'locked';

  if (
    !usesAnnouncedPlacementRules &&
    signup.forbidReserve &&
    signup.type === 'reserve'
  ) {
    return jsonSignupValidationError('Reserve is forbidden by signup condition', 400, [
      { signupId, displayName: signupDisplayName },
    ]);
  }

  if (signup.character) {
    if (
      !validateSignedSpec(signedSpec, signup.character.mainSpec, signup.character.offSpec)
    ) {
      return NextResponse.json({ error: 'Invalid signedSpec for character' }, { status: 400 });
    }
  }

  let nextType = signup.type;
  let setConfirmed = setConfirmedForPlacement(leaderPlacement);

  const plannerDeclined = body.plannerDeclined === true;

  if (usesAnnouncedPlacementRules) {
    nextType = resolveAnnouncedSignupType({
      currentType: signup.type,
      forbidReserve: signup.forbidReserve,
      leaderPlacement,
      plannerDeclined,
      unsetPlayersMode,
    });
    setConfirmed = setConfirmedForAnnouncedPlacement(leaderPlacement, nextType);
  }

  const updated = await prisma.rfRaidSignup.update({
    where: { id: signupId },
    data: {
      leaderAllowsReserve: effectiveLeaderAllowsReserve,
      leaderMarkedTeilnehmer,
      leaderPlacement,
      setConfirmed,
      ...(usesAnnouncedPlacementRules ? { type: nextType } : {}),
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
