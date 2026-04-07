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
  if (raid.status !== 'open') {
    return NextResponse.json({ error: 'Raid is not open' }, { status: 403 });
  }

  const character = await prisma.rfCharacter.findFirst({
    where: { id: characterId, userId: targetUserId, guildId },
    select: { id: true, mainSpec: true, offSpec: true },
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

  const setConfirmed = setConfirmedForPlacement(leaderPlacement);

  // Allow multiple signups per user (e.g. main + twink). We treat (raidId,userId,characterId) as the identity here:
  // - If a signup for this character already exists, update it.
  // - Otherwise create a new signup row.
  const existing = await prisma.rfRaidSignup.findFirst({
    where: { raidId, userId: targetUserId, characterId },
  });

  if (existing) {
    if (existing.forbidReserve && typeNorm === 'reserve') {
      return NextResponse.json(
        { error: 'Reserve is forbidden by signup condition' },
        { status: 400 }
      );
    }
    if (
      existing.onlySignedSpec &&
      existing.signedSpec &&
      existing.signedSpec.trim() !== signedSpecRaw.trim()
    ) {
      return NextResponse.json(
        { error: 'Spec is locked by signup condition' },
        { status: 400 }
      );
    }
    const prevSnap = snapshotSignup(existing);
    const updated = await prisma.rfRaidSignup.update({
      where: { id: existing.id },
      data: {
        characterId,
        type: typeNorm,
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
      type: typeNorm,
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
