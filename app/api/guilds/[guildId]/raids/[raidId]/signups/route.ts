import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { prisma } from '@/lib/prisma';
import { computeRaidSignupPhase, resolveRaidAccess } from '@/lib/raid-detail-access';
import { normalizeSignupType } from '@/lib/raid-signup-constants';
import { logRaidSignupAudit, snapshotSignup } from '@/lib/raid-signup-audit';
import { syncRaidThreadSummary } from '@/lib/raid-thread-sync';

const NOTE_MIN = 3;

function fireSync(raidId: string) {
  void syncRaidThreadSummary(raidId);
}

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
 * POST /api/guilds/[guildId]/raids/[raidId]/signups
 * Anmeldung anlegen/aktualisieren (ein Eintrag pro User pro Raid).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string; raidId: string }> }
) {
  const { guildId, raidId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.discordId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await getEffectiveUserId(
    session as { userId?: string; discordId?: string }
  );
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const access = await resolveRaidAccess(
    userId,
    session.discordId as string,
    guildId,
    raidId
  );
  if (!access.ok) {
    const status = access.reason === 'raid_not_found' ? 404 : 403;
    return NextResponse.json({ error: 'Forbidden' }, { status });
  }
  if (!access.canSignup) {
    return NextResponse.json(
      { error: 'Signup is closed for this raid' },
      { status: 403 }
    );
  }

  const raid = await prisma.rfRaid.findFirst({
    where: { id: raidId, guildId },
    select: { id: true, status: true, signupUntil: true },
  });
  if (!raid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const phase = computeRaidSignupPhase(raid);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const characterId =
    typeof body.characterId === 'string' ? body.characterId.trim() : '';
  const typeRaw = typeof body.type === 'string' ? body.type.trim() : '';
  const typeNorm = normalizeSignupType(typeRaw);
  const isLate = body.isLate === true;
  const note =
    typeof body.note === 'string' ? body.note.trim() : body.note === null ? '' : '';
  const signedSpecRaw =
    typeof body.signedSpec === 'string' ? body.signedSpec.trim() : '';

  if (!characterId || !typeNorm) {
    return NextResponse.json(
      { error: 'Missing or invalid characterId / type (normal | uncertain | reserve)' },
      { status: 400 }
    );
  }

  if (!signedSpecRaw) {
    return NextResponse.json({ error: 'Missing signedSpec (main or off spec)' }, { status: 400 });
  }

  if (phase === 'reserve_only' && typeNorm !== 'reserve') {
    return NextResponse.json(
      { error: 'After signup deadline only reserve is allowed' },
      { status: 400 }
    );
  }

  if (isLate) {
    if (note.length < NOTE_MIN) {
      return NextResponse.json(
        {
          error:
            'Late attendance requires a note (e.g. approximate delay)',
        },
        { status: 400 }
      );
    }
  }

  const character = await prisma.rfCharacter.findFirst({
    where: { id: characterId, userId, guildId },
    select: { id: true, mainSpec: true, offSpec: true },
  });
  if (!character) {
    return NextResponse.json(
      { error: 'Character not found for this guild' },
      { status: 400 }
    );
  }

  if (!validateSignedSpec(signedSpecRaw, character.mainSpec, character.offSpec)) {
    return NextResponse.json(
      { error: 'signedSpec must match main or off spec of the character' },
      { status: 400 }
    );
  }

  const data = {
    characterId,
    type: typeNorm,
    signedSpec: signedSpecRaw,
    isLate,
    note: note.length > 0 ? note : null,
  };

  const existing = await prisma.rfRaidSignup.findFirst({
    where: { raidId, userId },
  });

  if (existing) {
    const prevSnap = snapshotSignup({
      ...existing,
    });
    const updated = await prisma.rfRaidSignup.update({
      where: { id: existing.id },
      data: {
        ...data,
        allowReserve: false,
      },
      select: {
        id: true,
        type: true,
        characterId: true,
        signedSpec: true,
        isLate: true,
        note: true,
        allowReserve: true,
        leaderAllowsReserve: true,
        leaderMarkedTeilnehmer: true,
        signedAt: true,
      },
    });
    await logRaidSignupAudit({
      signupId: updated.id,
      raidId,
      guildId,
      changedByUserId: userId,
      action: 'signup_update',
      oldValue: prevSnap,
      newValue: snapshotSignup(updated),
    });
    fireSync(raidId);
    return NextResponse.json({ signup: updated });
  }

  const created = await prisma.rfRaidSignup.create({
    data: {
      raidId,
      userId,
      ...data,
      allowReserve: false,
      leaderAllowsReserve: true,
      leaderMarkedTeilnehmer: false,
    },
    select: {
      id: true,
      type: true,
      characterId: true,
      signedSpec: true,
      isLate: true,
      note: true,
      allowReserve: true,
      leaderAllowsReserve: true,
      leaderMarkedTeilnehmer: true,
      signedAt: true,
    },
  });
  await logRaidSignupAudit({
    signupId: created.id,
    raidId,
    guildId,
    changedByUserId: userId,
    action: 'signup_create',
    newValue: snapshotSignup(created),
  });
  fireSync(raidId);
  return NextResponse.json({ signup: created }, { status: 201 });
}

/**
 * DELETE /api/guilds/[guildId]/raids/[raidId]/signups
 * Eigene Anmeldung löschen (nur bei offenem Raid).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ guildId: string; raidId: string }> }
) {
  const { guildId, raidId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.discordId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await getEffectiveUserId(
    session as { userId?: string; discordId?: string }
  );
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const access = await resolveRaidAccess(
    userId,
    session.discordId as string,
    guildId,
    raidId
  );
  if (!access.ok) {
    const status = access.reason === 'raid_not_found' ? 404 : 403;
    return NextResponse.json({ error: 'Forbidden' }, { status });
  }

  const raid = await prisma.rfRaid.findFirst({
    where: { id: raidId, guildId },
    select: { status: true },
  });
  if (!raid || raid.status !== 'open') {
    return NextResponse.json({ error: 'Raid is not open' }, { status: 403 });
  }

  const existing = await prisma.rfRaidSignup.findFirst({
    where: { raidId, userId },
  });
  if (!existing) {
    return NextResponse.json({ error: 'No signup' }, { status: 404 });
  }

  const prevSnap = snapshotSignup(existing);
  await prisma.rfRaidSignup.delete({ where: { id: existing.id } });
  await logRaidSignupAudit({
    signupId: existing.id,
    raidId,
    guildId,
    changedByUserId: userId,
    action: 'signup_delete',
    oldValue: prevSnap,
  });
  fireSync(raidId);
  return NextResponse.json({ ok: true });
}
