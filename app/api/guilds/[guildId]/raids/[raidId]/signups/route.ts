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
import { syncRaidThreadSummary, postSignupChangeThreadNotice } from '@/lib/raid-thread-sync';
import {
  assignCharacterForGuestSignup,
  resolveGuestEligibility,
  resolveIsGuestSignup,
} from '@/lib/guest-raid-access';
import {
  ANNOUNCED_SET_PLAYER_COMMENT_MIN,
  requiresAnnouncedSetPlayerComment,
  snapFromMutationResult,
  snapFromSignupRow,
  tryNotifyAnnouncedSetPlayerChange,
  validateAnnouncedSetPlayerComment,
} from '@/lib/raid-announced-set-player-notify';

/**
 * POST /api/guilds/[guildId]/raids/[raidId]/signups
 * Anmeldung anlegen/aktualisieren (pro Charakter: raidId + userId + characterId).
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
    select: { id: true, status: true, signupUntil: true, scheduledAt: true },
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
      {
        error:
          'Missing or invalid characterId / type (normal | uncertain | reserve | declined)',
      },
      { status: 400 }
    );
  }

  const characterRaw = await prisma.rfCharacter.findFirst({
    where:
      access.accessMode === 'guest'
        ? {
            id: characterId,
            userId,
            OR: [{ guildId: null }, { guildId }],
          }
        : { id: characterId, userId, guildId },
    select: { id: true, name: true, mainSpec: true, offSpec: true, guildId: true },
  });
  if (!characterRaw) {
    return NextResponse.json(
      {
        error:
          access.accessMode === 'guest'
            ? 'Character not found'
            : 'Character not found for this guild',
      },
      { status: 400 }
    );
  }

  if (access.accessMode === 'guest') {
    const guestCheck = await resolveGuestEligibility(
      userId,
      session.discordId as string,
      guildId
    );
    if (!guestCheck.eligible) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const assigned = await assignCharacterForGuestSignup({
      userId,
      characterId: characterRaw.id,
      guildId,
      discordId: session.discordId as string,
      displayNameInGuild: guestCheck.displayNameInGuild,
    });
    if (!assigned.ok) {
      return NextResponse.json({ error: assigned.error }, { status: assigned.status });
    }
  }

  const character = {
    id: characterRaw.id,
    name: characterRaw.name,
    mainSpec: characterRaw.mainSpec,
    offSpec: characterRaw.offSpec,
  };

  const isGuest =
    access.accessMode === 'guest' ||
    (await resolveIsGuestSignup(userId, session.discordId as string, guildId));

  const signedSpecForRules =
    typeNorm === 'declined' ? signedSpecRaw || character.mainSpec : signedSpecRaw;

  if (!signedSpecForRules) {
    return NextResponse.json({ error: 'Missing signedSpec (main or off spec)' }, { status: 400 });
  }

  const rules = validateRaidSignupBusinessRules({
    phase,
    typeNorm,
    forbidReserve,
    punctuality,
    note,
    signedSpecRaw: signedSpecForRules,
    characterMainSpec: character.mainSpec,
    characterOffSpec: character.offSpec,
  });
  if (!rules.ok) {
    return NextResponse.json({ error: rules.error }, { status: rules.status });
  }

  const existingBefore = await prisma.rfRaidSignup.findFirst({
    where: { raidId, userId, characterId: character.id },
    select: {
      type: true,
      signedSpec: true,
      punctuality: true,
      note: true,
      onlySignedSpec: true,
      forbidReserve: true,
      setConfirmed: true,
    },
  });

  if (raid.status === 'announced' && existingBefore?.setConfirmed) {
    const commentRequired = requiresAnnouncedSetPlayerComment('edit', typeNorm);
    const commentCheck = validateAnnouncedSetPlayerComment(note, commentRequired);
    if (!commentCheck.ok) {
      return NextResponse.json({ error: commentCheck.error }, { status: commentCheck.status });
    }
  }

  const { signup, isCreate } = await commitRaidSelfSignupMutation({
    raidId,
    guildId,
    userId,
    changedByUserId: userId,
    characterId: character.id,
    typeNorm,
    signedSpecRaw: signedSpecForRules,
    onlySignedSpec: typeNorm === 'declined' ? false : onlySignedSpec,
    forbidReserve: typeNorm === 'declined' ? false : forbidReserve,
    punctuality: typeNorm === 'declined' ? 'on_time' : punctuality,
    note,
    isGuest,
  });
  await syncRaidThreadSummary(raidId);
  await postSignupChangeThreadNotice(raidId, isCreate ? 'signup' : 'edit', {
    characterName: character.name,
    signedSpec:    signedSpecForRules || null,
    type:          typeNorm,
    punctuality: typeNorm === 'declined' ? 'on_time' : punctuality,
  });

  if (!isCreate && existingBefore?.setConfirmed && raid.status === 'announced') {
    await tryNotifyAnnouncedSetPlayerChange({
      raidId,
      guildId,
      userId,
      kind: 'edit',
      characterName: character.name,
      previous: snapFromSignupRow(existingBefore),
      next: snapFromMutationResult(signup),
      comment: note,
    });
  }

  return NextResponse.json({ signup }, { status: isCreate ? 201 : 200 });
}

const WITHDRAW_REASON_MIN = ANNOUNCED_SET_PLAYER_COMMENT_MIN;

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
  if (!access.canSignup) {
    return NextResponse.json({ error: 'Signup is closed for this raid' }, { status: 403 });
  }

  const raid = await prisma.rfRaid.findFirst({
    where: { id: raidId, guildId },
    select: { status: true },
  });
  if (!raid || (raid.status !== 'open' && raid.status !== 'announced')) {
    return NextResponse.json({ error: 'Withdrawal is not allowed for this raid' }, { status: 403 });
  }

  let withdrawReason = '';
  let characterIdFilter: string | undefined;
  const rawBody = await request.text().catch(() => '');
  if (rawBody.trim()) {
    try {
      const j = JSON.parse(rawBody) as { withdrawReason?: unknown; characterId?: unknown };
      withdrawReason = typeof j.withdrawReason === 'string' ? j.withdrawReason.trim() : '';
      const cid = typeof j.characterId === 'string' ? j.characterId.trim() : '';
      if (cid) characterIdFilter = cid;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
  }

  const toRemove = await prisma.rfRaidSignup.findMany({
    where: characterIdFilter
      ? { raidId, userId, characterId: characterIdFilter }
      : { raidId, userId },
  });
  if (toRemove.length === 0) {
    return NextResponse.json({ error: 'No signup' }, { status: 404 });
  }

  const needsWithdrawReason =
    raid.status === 'announced' && toRemove.some((s) => s.setConfirmed);
  if (needsWithdrawReason && withdrawReason.length < WITHDRAW_REASON_MIN) {
    return NextResponse.json(
      {
        error: `withdrawReason required (min ${WITHDRAW_REASON_MIN} characters) when leaving a confirmed slot on an announced raid`,
      },
      { status: 400 }
    );
  }

  const { withdrawRaidSignupRows } = await import('@/lib/raid-signup-withdraw');
  await withdrawRaidSignupRows(prisma, {
    raidId,
    signupIds: toRemove.map((s) => s.id),
    changedByUserId: userId,
    guildId,
  });

  for (const existing of toRemove) {
    const deletedChar = existing.characterId
      ? await prisma.rfCharacter.findUnique({
          where: { id: existing.characterId },
          select: { name: true },
        })
      : null;

    if (
      raid.status === 'announced' &&
      existing.setConfirmed &&
      withdrawReason.length >= WITHDRAW_REASON_MIN
    ) {
      await logRaidSignupAudit({
        signupId: existing.id,
        raidId,
        guildId,
        changedByUserId: userId,
        action: 'signup_withdraw_reason',
        newValue: JSON.stringify({ withdrawReason }),
      });
    }

    await postSignupChangeThreadNotice(raidId, 'unsignup', {
      characterName: deletedChar?.name ?? null,
      signedSpec: existing.signedSpec,
      type: 'declined',
      punctuality: existing.punctuality,
    });

    if (raid.status === 'announced' && existing.setConfirmed) {
      await tryNotifyAnnouncedSetPlayerChange({
        raidId,
        guildId,
        userId,
        kind: 'unsignup',
        characterName: deletedChar?.name ?? '?',
        previous: snapFromSignupRow(existing),
        comment: withdrawReason,
      });
    }
  }
  await syncRaidThreadSummary(raidId);
  return NextResponse.json({ ok: true });
}
