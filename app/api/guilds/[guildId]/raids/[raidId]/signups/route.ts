import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { prisma } from '@/lib/prisma';
import { computeRaidSignupPhase, resolveRaidAccess } from '@/lib/raid-detail-access';
import { normalizeSignupPunctuality, normalizeSignupType } from '@/lib/raid-signup-constants';
import {
  commitRaidSelfSignupMutation,
  validateRaidSignupBusinessRules,
} from '@/lib/raid-self-signup-mutation';
import { logRaidSignupAudit, snapshotSignup } from '@/lib/raid-signup-audit';
import { syncRaidThreadSummary } from '@/lib/raid-thread-sync';

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
  const punctuality = normalizeSignupPunctuality(body.punctuality, body.isLate === true);
  const note =
    typeof body.note === 'string' ? body.note.trim() : body.note === null ? '' : '';
  const signedSpecRaw =
    typeof body.signedSpec === 'string' ? body.signedSpec.trim() : '';
  const onlySignedSpec = body.onlySignedSpec === true;
  const forbidReserve = body.forbidReserve === true;

  if (!characterId || !typeNorm) {
    return NextResponse.json(
      { error: 'Missing or invalid characterId / type (normal | uncertain | reserve)' },
      { status: 400 }
    );
  }

  if (!signedSpecRaw) {
    return NextResponse.json({ error: 'Missing signedSpec (main or off spec)' }, { status: 400 });
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

  const rules = validateRaidSignupBusinessRules({
    phase,
    typeNorm,
    forbidReserve,
    punctuality,
    note,
    signedSpecRaw,
    characterMainSpec: character.mainSpec,
    characterOffSpec: character.offSpec,
  });
  if (!rules.ok) {
    return NextResponse.json({ error: rules.error }, { status: rules.status });
  }

  const { signup, isCreate } = await commitRaidSelfSignupMutation({
    raidId,
    guildId,
    userId,
    changedByUserId: userId,
    characterId: character.id,
    typeNorm,
    signedSpecRaw,
    onlySignedSpec,
    forbidReserve,
    punctuality,
    note,
  });
  await syncRaidThreadSummary(raidId);
  return NextResponse.json({ signup }, { status: isCreate ? 201 : 200 });
}

const WITHDRAW_REASON_MIN = 10;

/**
 * DELETE /api/guilds/[guildId]/raids/[raidId]/signups
 * Eigene Anmeldung löschen (offener Raid oder angekündigter Raid; bei Gesetzt + angekündigt Begründungspflicht).
 */
export async function DELETE(
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

  const raid = await prisma.rfRaid.findFirst({
    where: { id: raidId, guildId },
    select: { status: true },
  });
  if (!raid || (raid.status !== 'open' && raid.status !== 'announced')) {
    return NextResponse.json({ error: 'Withdrawal is not allowed for this raid' }, { status: 403 });
  }

  const existing = await prisma.rfRaidSignup.findFirst({
    where: { raidId, userId },
  });
  if (!existing) {
    return NextResponse.json({ error: 'No signup' }, { status: 404 });
  }

  let withdrawReason = '';
  const rawBody = await request.text().catch(() => '');
  if (rawBody.trim()) {
    try {
      const j = JSON.parse(rawBody) as { withdrawReason?: unknown };
      withdrawReason = typeof j.withdrawReason === 'string' ? j.withdrawReason.trim() : '';
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  }

  if (raid.status === 'announced' && existing.setConfirmed) {
    if (withdrawReason.length < WITHDRAW_REASON_MIN) {
      return NextResponse.json(
        {
          error: `withdrawReason required (min ${WITHDRAW_REASON_MIN} characters) when leaving a confirmed slot on an announced raid`,
        },
        { status: 400 }
      );
    }
  }

  const prevSnap = snapshotSignup(existing);
  await prisma.rfRaidSignup.delete({ where: { id: existing.id } });
  const auditNewValue =
    raid.status === 'announced' && existing.setConfirmed && withdrawReason.length >= WITHDRAW_REASON_MIN
      ? JSON.stringify({ withdrawReason })
      : null;
  await logRaidSignupAudit({
    signupId: existing.id,
    raidId,
    guildId,
    changedByUserId: userId,
    action: 'signup_delete',
    oldValue: prevSnap,
    newValue: auditNewValue,
  });
  await syncRaidThreadSummary(raidId);
  return NextResponse.json({ ok: true });
}
