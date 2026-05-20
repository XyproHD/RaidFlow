import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRaidPlannerForGuild } from '@/lib/raid-planner-auth';
import { normalizeSignupType } from '@/lib/raid-signup-constants';
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
 * POST …/signups/leader
 * Raidleader: Spieler aus Pool hinzufügen (Anmeldung / Ersatz / Gesetzt).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string; raidId: string }> }
) {
  const { guildId, raidId } = await params;
  const auth = await requireRaidPlannerForGuild(guildId);
  if (!auth) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const actingUserId = auth.userId;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const targetUserId =
    typeof body.targetUserId === 'string' ? body.targetUserId.trim() : '';
  const characterId =
    typeof body.characterId === 'string' ? body.characterId.trim() : '';
  const typeRaw = typeof body.type === 'string' ? body.type.trim() : '';
  const typeNorm = normalizeSignupType(typeRaw);
  const signedSpecRaw =
    typeof body.signedSpec === 'string' ? body.signedSpec.trim() : '';
  const noteRaw =
    typeof body.note === 'string' ? body.note.trim() : body.note === null ? '' : '';
  const note = noteRaw.length > 0 ? noteRaw : null;
  const placementRaw = parseLeaderPlacement(body.leaderPlacement);
  const leaderPlacement: LeaderPlacement = placementRaw ?? 'signup';

  if (!targetUserId || !characterId || !typeNorm || !signedSpecRaw) {
    return NextResponse.json(
      { error: 'Missing targetUserId, characterId, type, signedSpec' },
      { status: 400 }
    );
  }

  const raid = await prisma.rfRaid.findFirst({
    where: { id: raidId, guildId },
    select: { id: true, status: true },
  });
  if (!raid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (raid.status === 'completed' || raid.status === 'cancelled') {
    return NextResponse.json({ error: 'Raid is not open for planning' }, { status: 403 });
  }
  if (raid.status !== 'open' && raid.status !== 'announced' && raid.status !== 'locked') {
    return NextResponse.json({ error: 'Raid is not open for planning' }, { status: 403 });
  }

  const character = await prisma.rfCharacter.findFirst({
    where: { id: characterId, userId: targetUserId, guildId },
    select: {
      id: true,
      name: true,
      guildDiscordDisplayName: true,
      mainSpec: true,
      offSpec: true,
    },
  });
  if (!character) {
    return NextResponse.json(
      { error: 'Character not found for this user and guild' },
      { status: 400 }
    );
  }

  if (!validateSignedSpec(signedSpecRaw, character.mainSpec, character.offSpec)) {
    return NextResponse.json({ error: 'signedSpec must match main or off spec' }, { status: 400 });
  }

  // Allow multiple signups per user (e.g. main + twink). We treat (raidId,userId,characterId) as the identity here:
  // - If a signup for this character already exists, update it.
  // - Otherwise create a new signup row.
  const existing = await prisma.rfRaidSignup.findFirst({
    where: { raidId, userId: targetUserId, characterId },
  });

  const unsetPlayersMode = parseUnsetPlayersMode(body.unsetPlayersMode);
  const usesAnnouncedPlacementRules =
    raid.status === 'announced' || raid.status === 'locked';
  const displayName = displayNameForSignupRow({ character });

  let typeForDb = typeNorm;
  let setConfirmed = setConfirmedForPlacement(leaderPlacement);

  const plannerDeclined = body.plannerDeclined === true;

  if (usesAnnouncedPlacementRules) {
    typeForDb = resolveAnnouncedSignupType({
      currentType: existing?.type ?? typeNorm,
      forbidReserve: existing?.forbidReserve ?? false,
      leaderPlacement,
      plannerDeclined,
      unsetPlayersMode,
    });
    setConfirmed = setConfirmedForAnnouncedPlacement(leaderPlacement, typeForDb);
  } else {
    setConfirmed = setConfirmedForPlacement(leaderPlacement);
  }

  if (existing) {
    if (
      !usesAnnouncedPlacementRules &&
      existing.forbidReserve &&
      typeNorm === 'reserve'
    ) {
      return jsonSignupValidationError('Reserve is forbidden by signup condition', 400, [
        { signupId: existing.id, displayName },
      ]);
    }
    if (
      existing.onlySignedSpec &&
      existing.signedSpec &&
      existing.signedSpec.trim() !== signedSpecRaw.trim()
    ) {
      return jsonSignupValidationError('Spec is locked by signup condition', 400, [
        { signupId: existing.id, displayName },
      ]);
    }
    const prevSnap = snapshotSignup(existing);
    const updated = await prisma.rfRaidSignup.update({
      where: { id: existing.id },
      data: {
        characterId,
        type: typeForDb,
        signedSpec: signedSpecRaw,
        note,
        leaderAllowsReserve: existing.forbidReserve ? false : existing.leaderAllowsReserve,
        leaderPlacement,
        setConfirmed,
      },
    });
    await logRaidSignupAudit({
      signupId: updated.id,
      raidId,
      guildId,
      changedByUserId: actingUserId,
      action: 'leader_add_update',
      oldValue: prevSnap,
      newValue: snapshotSignup(updated),
    });
    void syncRaidThreadSummary(raidId);
    return NextResponse.json({ signup: updated });
  }

  const created = await prisma.rfRaidSignup.create({
    data: {
      raidId,
      userId: targetUserId,
      characterId,
      type: typeForDb,
      signedSpec: signedSpecRaw,
      allowReserve: false,
      isLate: false,
      note,
      leaderAllowsReserve: true,
      leaderMarkedTeilnehmer: false,
      onlySignedSpec: false,
      forbidReserve: false,
      leaderPlacement,
      setConfirmed,
    },
  });
  await logRaidSignupAudit({
    signupId: created.id,
    raidId,
    guildId,
    changedByUserId: actingUserId,
    action: 'leader_add_create',
    newValue: snapshotSignup(created),
  });
  void syncRaidThreadSummary(raidId);
  return NextResponse.json({ signup: created }, { status: 201 });
}
