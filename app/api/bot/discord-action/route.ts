import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBotSecret } from '@/lib/bot-auth';
import { resolveRaidAccess, computeRaidSignupPhase } from '@/lib/raid-detail-access';
import {
  commitRaidSelfSignupMutation,
  validateRaidSignupBusinessRules,
  validateSignedSpecForCharacter,
} from '@/lib/raid-self-signup-mutation';
import { normalizeSignupType, normalizeSignupPunctuality } from '@/lib/raid-signup-constants';
import {
  postRaidLeaderChannelInfo,
  postRaidRaiderChannelMention,
  postSignupChangeThreadNotice,
  pushRaidDiscordPost,
  syncRaidThreadSummary,
} from '@/lib/raid-thread-sync';
import { getRaidDiscordDisplaySnapshot } from '@/lib/raid-discord-display-snapshot';
import {
  assignCharacterToRaidGuild,
  buildRaidParticipantState,
} from '@/lib/discord-raid-participant';
import { syncDiscordUserGuildMemberships } from '@/lib/sync-user-guild-memberships';
import { getAppConfig } from '@/lib/app-config';
import {
  ANNOUNCED_SET_PLAYER_COMMENT_MIN,
  requiresAnnouncedSetPlayerComment,
  snapFromMutationResult,
  snapFromSignupRow,
  tryNotifyAnnouncedSetPlayerChange,
  validateAnnouncedSetPlayerComment,
} from '@/lib/raid-announced-set-player-notify';

/**
 * Discord-Interaktions-API (aufgerufen durch discord-bot nach Button-/Modal-Interaktionen).
 *
 * POST /api/bot/discord-action
 * Aktionen:
 *   quickjoin       – Main-Char, Standard-Bedingungen, pünktlich, keine Notiz
 *   join            – Eigene Anmeldung (characterId, type, signedSpec, note, punctuality)
 *   edit-signup     – Bestehende Anmeldung bearbeiten (gleiche Felder wie join)
 *   unregister      – Abmelden (optional: reason für späte Absage)
 *   sync-post       – Discord-Beitrag neu synchronisieren (RaidTools, Raidleader+)
 *   push-raid         – Raid-Post löschen und neu senden (ohne Erwähnung)
 *   push-raid-mention – Raider-Erwähnung im Channel, dann Push (mentionText)
 *   leader-info     – Freitext an Raidleader-Kanal (message, discordUserLabel)
 *
 * GET /api/bot/discord-action?action=get-signup&discordUserId=...&raidId=...
 * GET /api/bot/discord-action?action=get-raid-tools&discordUserId=...&raidId=...
 *   canManage (Raidleader/Gildenmeister inkl. Owner-Web-Override), hasLeaderChannel
 *   Gibt aktuelle Anmeldedaten zurück (für Edit-Modal pre-fill).
 *
 * GET /api/bot/discord-action?action=get-chars&discordUserId=...&raidId=...
 *   Gibt Charaktere des Users für die Gilde des Raids zurück.
 *
 * GET /api/bot/discord-action?action=get-raid-display&raidId=...
 *   Embed-Snapshot + Fingerprint für stillen Bot-Abgleich (nur Bot-Secret).
 *
 * Auth: BOT_SETUP_SECRET (Bearer-Token).
 */

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const action        = searchParams.get('action')?.trim() ?? '';
  const discordUserId = searchParams.get('discordUserId')?.trim() ?? '';
  const raidId        = searchParams.get('raidId')?.trim() ?? '';

  if (action === 'get-raid-display') {
    if (!raidId) {
      return NextResponse.json({ error: 'Missing raidId' }, { status: 400 });
    }
    const snapshot = await getRaidDiscordDisplaySnapshot(raidId);
    if (!snapshot) {
      return NextResponse.json({ error: 'Raid display not available' }, { status: 404 });
    }
    return NextResponse.json(snapshot);
  }

  if (!discordUserId || !raidId) {
    return NextResponse.json({ error: 'Missing discordUserId or raidId' }, { status: 400 });
  }

  const raid = await prisma.rfRaid.findUnique({
    where:  { id: raidId },
    select: {
      id: true,
      guildId: true,
      signupUntil: true,
      scheduledAt: true,
      status: true,
      discordLeaderChannelId: true,
    },
  });
  if (!raid) {
    return NextResponse.json({ error: 'Raid not found' }, { status: 404 });
  }

  const user = await prisma.rfUser.findUnique({
    where:  { discordId: discordUserId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ linked: false }, { status: 200 });
  }

  const signupPhase = computeRaidSignupPhase(raid);

  if (action === 'get-raid-tools') {
    const access = await resolveRaidAccess(user.id, discordUserId, raid.guildId, raidId);
    if (!access.ok) {
      return NextResponse.json({ linked: true, canManage: false, hasLeaderChannel: false }, { status: 200 });
    }
    return NextResponse.json({
      linked: true,
      canManage: access.canEdit,
      hasLeaderChannel: !!raid.discordLeaderChannelId?.trim(),
    });
  }

  if (action === 'get-signup') {
    const [rawSignups, appCfg] = await Promise.all([
      prisma.rfRaidSignup.findMany({
        where:   { raidId, userId: user.id },
        include: { character: { select: { id: true, name: true, mainSpec: true, offSpec: true, isMain: true } } },
        orderBy: { signedAt: 'asc' },
      }),
      getAppConfig().catch(() => null),
    ]);
    const discordEmojis = appCfg?.discordEmojis ?? {};
    const signups = rawSignups.map(s => ({
      id:          s.id,
      type:        s.type,
      signedSpec:  s.signedSpec,
      punctuality: s.punctuality,
      note:        s.note,
      isLate:      s.isLate,
      setConfirmed: s.setConfirmed,
      character:   s.character
        ? { id: s.character.id, name: s.character.name, mainSpec: s.character.mainSpec, offSpec: s.character.offSpec, isMain: s.character.isMain }
        : null,
    }));
    return NextResponse.json({
      linked: true,
      signups,
      discordEmojis,
      signupUntil: raid.signupUntil.toISOString(),
      signupPhase,
      raidStatus: raid.status,
    });
  }

  if (action === 'raid-participant-state') {
    const discordGuildId = searchParams.get('discordGuildId')?.trim() ?? '';
    const state = await buildRaidParticipantState(discordUserId, raidId, {
      syncDiscordGuildId: discordGuildId || null,
    });
    if (!state) {
      return NextResponse.json({ error: 'Raid not found' }, { status: 404 });
    }
    return NextResponse.json(state);
  }

  if (action === 'get-chars') {
    const [chars, appCfg] = await Promise.all([
      prisma.rfCharacter.findMany({
        where: { userId: user.id, guildId: raid.guildId },
        select: { id: true, name: true, mainSpec: true, offSpec: true, isMain: true },
        orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
        take: 25,
      }),
      getAppConfig().catch(() => null),
    ]);
    return NextResponse.json({
      linked: true,
      guildId: raid.guildId,
      characters: chars,
      discordEmojis: appCfg?.discordEmojis ?? {},
      signupPhase,
    });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action        = typeof body.action        === 'string' ? body.action.trim()        : '';
  const discordUserId = typeof body.discordUserId === 'string' ? body.discordUserId.trim() : '';
  const raidId        = typeof body.raidId        === 'string' ? body.raidId.trim()        : '';

  if (!action || !discordUserId || !raidId) {
    return NextResponse.json({ error: 'Missing action / discordUserId / raidId' }, { status: 400 });
  }

  const discordGuildId =
    typeof body.discordGuildId === 'string' ? body.discordGuildId.trim() : '';

  // Raid-Lookup (guildId aus raidId ableiten)
  const raid = await prisma.rfRaid.findUnique({
    where:  { id: raidId },
    select: {
      id: true,
      guildId: true,
      status: true,
      signupUntil: true,
      scheduledAt: true,
      guild: { select: { discordGuildId: true } },
    },
  });
  if (!raid) {
    return NextResponse.json({ error: 'Raid not found' }, { status: 404 });
  }

  if (action === 'assign-character-guild') {
    const characterId =
      typeof body.characterId === 'string' ? body.characterId.trim() : '';
    if (!characterId) {
      return NextResponse.json({ error: 'Missing characterId' }, { status: 400 });
    }
    const result = await assignCharacterToRaidGuild({
      discordUserId,
      raidId,
      characterId,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, message: result.message },
        { status: result.status }
      );
    }
    return NextResponse.json({ ok: true, characterId: result.characterId });
  }

  const syncGuildDiscordId = discordGuildId || raid.guild.discordGuildId || undefined;
  const syncResult = await syncDiscordUserGuildMemberships({
    discordUserId,
    discordGuildId: syncGuildDiscordId,
  });

  const user = await prisma.rfUser.findUnique({
    where:  { discordId: discordUserId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json(
      { error: 'NOT_LINKED', message: 'Discord-Konto ist nicht mit RaidFlow verknüpft.' },
      { status: 403 }
    );
  }

  // Zugriff prüfen
  const access = await resolveRaidAccess(syncResult.userId, discordUserId, raid.guildId, raidId);
  if (!access.ok) {
    return NextResponse.json(
      {
        error: 'NOT_GUILD_MEMBER',
        message: 'Du bist kein RaidFlow-Mitglied dieser Gilde.',
      },
      { status: 403 }
    );
  }

  // -------------------------------------------------------------------------
  // Quickjoin
  // -------------------------------------------------------------------------
  if (action === 'quickjoin') {
    if (!access.canSignup) {
      return NextResponse.json(
        { error: 'SIGNUP_CLOSED', message: 'Anmeldung ist geschlossen oder Raid nicht mehr offen.' },
        { status: 403 }
      );
    }

    const phase = computeRaidSignupPhase(raid);
    const main  = await prisma.rfCharacter.findFirst({
      where:   { userId: user.id, guildId: raid.guildId, isMain: true },
      select:  { id: true, name: true, mainSpec: true },
      orderBy: { updatedAt: 'desc' },
    });
    const fallback = !main
      ? await prisma.rfCharacter.findFirst({
          where:   { userId: user.id, guildId: raid.guildId },
          select:  { id: true, name: true, mainSpec: true },
          orderBy: { updatedAt: 'desc' },
        })
      : null;
    const picked = main ?? fallback;
    if (!picked) {
      return NextResponse.json({ error: 'NO_CHARACTER', message: 'Kein Charakter in dieser Gilde gefunden.' }, { status: 400 });
    }

    const existing = await prisma.rfRaidSignup.findFirst({
      where: { raidId, userId: user.id, characterId: picked.id },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: 'ALREADY_SIGNED_UP',
          message: 'Du bist mit diesem Charakter bereits angemeldet.',
        },
        { status: 409 }
      );
    }

    await prisma.rfRaidSignup.create({
      data: {
        raidId,
        userId:               user.id,
        characterId:          picked.id,
        type:                 phase === 'reserve_only' ? 'reserve' : 'normal',
        punctuality:          'on_time',
        isLate:               false,
        note:                 null,
        signedSpec:           picked.mainSpec,
        onlySignedSpec:       false,
        forbidReserve:        false,
        allowReserve:         false,
        leaderAllowsReserve:  true,
        leaderMarkedTeilnehmer: false,
        leaderPlacement:      'signup',
        setConfirmed:         false,
      },
    });

    const pickedType = phase === 'reserve_only' ? 'reserve' : 'normal';
    await syncRaidThreadSummary(raidId, { embedOnly: true });
    await postSignupChangeThreadNotice(raidId, 'signup', {
      characterName: picked.name,
      signedSpec:    picked.mainSpec,
      type:          pickedType,
      punctuality:   'on_time',
    });
    return NextResponse.json({ ok: true, message: 'Quickjoin erfolgreich!' });
  }

  // -------------------------------------------------------------------------
  // Join / Edit-Signup
  // -------------------------------------------------------------------------
  if (action === 'join' || action === 'edit-signup') {
    if (!access.canSignup) {
      return NextResponse.json(
        { error: 'SIGNUP_CLOSED', message: 'Anmeldung ist geschlossen oder Raid nicht mehr offen.' },
        { status: 403 }
      );
    }

    const characterId    = typeof body.characterId    === 'string' ? body.characterId.trim()    : '';
    const typeRaw        = typeof body.type           === 'string' ? body.type.trim()            : 'normal';
    const signedSpecRaw  = typeof body.signedSpec     === 'string' ? body.signedSpec.trim()      : '';
    const noteRaw        = typeof body.note           === 'string' ? body.note.trim()            : '';
    const punctualityRaw = typeof body.punctuality    === 'string' ? body.punctuality.trim()     : 'on_time';
    const onlySignedSpec = body.onlySignedSpec === true;
    const forbidReserve  = body.forbidReserve  === true;

    if (!characterId) {
      return NextResponse.json({ error: 'Missing characterId' }, { status: 400 });
    }

    const typeNorm = normalizeSignupType(typeRaw);
    if (!typeNorm) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
    }

    const punctuality = normalizeSignupPunctuality(punctualityRaw, punctualityRaw === 'late');

    const char = await prisma.rfCharacter.findFirst({
      where:  { id: characterId, userId: user.id, guildId: raid.guildId },
      select: { id: true, name: true, mainSpec: true, offSpec: true },
    });
    if (!char) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    const effectiveSpec = signedSpecRaw || char.mainSpec;
    const phase = computeRaidSignupPhase(raid);

    const validation = validateRaidSignupBusinessRules({
      phase,
      typeNorm,
      forbidReserve,
      punctuality,
      note:              noteRaw,
      signedSpecRaw:     effectiveSpec,
      characterMainSpec: char.mainSpec,
      characterOffSpec:  char.offSpec ?? null,
    });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const existingBefore = await prisma.rfRaidSignup.findFirst({
      where: { raidId, userId: user.id, characterId: char.id },
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
      const commentCheck = validateAnnouncedSetPlayerComment(noteRaw, commentRequired);
      if (!commentCheck.ok) {
        return NextResponse.json(
          {
            error: 'COMMENT_REQUIRED',
            message: `Bei Änderung auf Reserve oder „Nicht da“ ist eine Begründung nötig (mind. ${ANNOUNCED_SET_PLAYER_COMMENT_MIN} Zeichen).`,
          },
          { status: commentCheck.status }
        );
      }
    }

    const discordUserLabel =
      typeof body.discordUserLabel === 'string' ? body.discordUserLabel.trim() : '';

    const { signup, isCreate } = await commitRaidSelfSignupMutation({
      raidId,
      guildId:        raid.guildId,
      userId:         user.id,
      changedByUserId: user.id,
      characterId:    char.id,
      typeNorm,
      signedSpecRaw:  effectiveSpec,
      onlySignedSpec,
      forbidReserve,
      punctuality,
      note:           noteRaw,
    });

    await syncRaidThreadSummary(raidId, { embedOnly: true });
    await postSignupChangeThreadNotice(raidId, isCreate ? 'signup' : 'edit', {
      characterName: char.name,
      signedSpec:    effectiveSpec,
      type:          typeNorm,
      punctuality,
    });

    if (!isCreate && existingBefore?.setConfirmed && raid.status === 'announced') {
      await tryNotifyAnnouncedSetPlayerChange({
        raidId,
        guildId: raid.guildId,
        userId: user.id,
        actorLabel: discordUserLabel || undefined,
        kind: 'edit',
        characterName: char.name,
        previous: snapFromSignupRow(existingBefore),
        next: snapFromMutationResult(signup),
        comment: noteRaw,
      });
    }

    return NextResponse.json({
      ok: true,
      isCreate,
      message: isCreate ? 'Anmeldung erfolgreich!' : 'Anmeldung aktualisiert!',
    });
  }

  // -------------------------------------------------------------------------
  // Nicht da (Declined)
  // -------------------------------------------------------------------------
  if (action === 'decline') {
    if (!access.canSignup) {
      return NextResponse.json(
        { error: 'SIGNUP_CLOSED', message: 'Anmeldung ist geschlossen oder Raid nicht mehr offen.' },
        { status: 403 }
      );
    }
    const declineReason = typeof body.reason === 'string' ? body.reason.trim() : '';

    const removedRows = await prisma.rfRaidSignup.findMany({
      where:   { raidId, userId: user.id },
      include: { character: { select: { id: true, name: true, mainSpec: true, isMain: true } } },
      orderBy: { signedAt: 'asc' },
    });

    const setConfirmedRemoved = removedRows.filter((r) => r.setConfirmed);
    if (raid.status === 'announced' && setConfirmedRemoved.length > 0) {
      const commentCheck = validateAnnouncedSetPlayerComment(declineReason, true);
      if (!commentCheck.ok) {
        return NextResponse.json(
          {
            error: 'COMMENT_REQUIRED',
            message: `Als gesetzter Spieler ist eine Begründung nötig (mind. ${ANNOUNCED_SET_PLAYER_COMMENT_MIN} Zeichen).`,
          },
          { status: commentCheck.status }
        );
      }
    }

    const declineActorLabel =
      typeof body.discordUserLabel === 'string' ? body.discordUserLabel.trim() : '';

    let markerChar = removedRows.find(r => r.character?.isMain)?.character ?? null;
    if (!markerChar) {
      markerChar = (await prisma.rfCharacter.findFirst({
        where:   { userId: user.id, guildId: raid.guildId, isMain: true },
        select:  { id: true, name: true, mainSpec: true, isMain: true },
        orderBy: { updatedAt: 'desc' },
      })) ?? null;
    }
    if (!markerChar) {
      markerChar = await prisma.rfCharacter.findFirst({
        where:   { userId: user.id, guildId: raid.guildId },
        select:  { id: true, name: true, mainSpec: true, isMain: true },
        orderBy: { updatedAt: 'desc' },
      });
    }
    if (!markerChar) {
      return NextResponse.json({ error: 'NO_CHARACTER', message: 'Kein Charakter in dieser Gilde gefunden.' }, { status: 400 });
    }

    const { withdrawRaidSignupRows } = await import('@/lib/raid-signup-withdraw');
    let isCreate = false;
    if (removedRows.length === 0) {
      const result = await commitRaidSelfSignupMutation({
        raidId,
        guildId: raid.guildId,
        userId: user.id,
        changedByUserId: user.id,
        characterId: markerChar.id,
        typeNorm: 'declined',
        signedSpecRaw: markerChar.mainSpec,
        onlySignedSpec: false,
        forbidReserve: false,
        punctuality: 'on_time',
        note: '',
      });
      isCreate = result.isCreate;
    } else {
      await withdrawRaidSignupRows(prisma, {
        raidId,
        signupIds: removedRows.map((r) => r.id),
        changedByUserId: user.id,
        guildId: raid.guildId,
      });
    }

    await syncRaidThreadSummary(raidId, { embedOnly: true });
    for (const row of removedRows) {
      await postSignupChangeThreadNotice(raidId, 'unsignup', {
        characterName: row.character?.name ?? null,
        signedSpec: row.signedSpec,
        type: 'declined',
        punctuality: row.punctuality,
      });
    }
    if (removedRows.length === 0) {
      await postSignupChangeThreadNotice(raidId, isCreate ? 'signup' : 'edit', {
        characterName: markerChar.name,
        signedSpec: markerChar.mainSpec,
        type: 'declined',
        punctuality: 'on_time',
      });
    }

    if (raid.status === 'announced') {
      for (const row of setConfirmedRemoved) {
        await tryNotifyAnnouncedSetPlayerChange({
          raidId,
          guildId: raid.guildId,
          userId: user.id,
          actorLabel: declineActorLabel || undefined,
          kind: 'unsignup',
          characterName: row.character?.name ?? '?',
          previous: snapFromSignupRow(row),
          comment: declineReason,
        });
      }
    }

    return NextResponse.json({ ok: true, message: 'Du bist als „nicht da“ markiert.' });
  }

  // -------------------------------------------------------------------------
  // Abmelden (Unregister)
  // -------------------------------------------------------------------------
  if (action === 'unregister') {
    if (!access.canSignup) {
      return NextResponse.json(
        { error: 'SIGNUP_CLOSED', message: 'Anmeldung ist geschlossen oder Raid nicht mehr offen.' },
        { status: 403 }
      );
    }
    const reason        = typeof body.reason    === 'string' ? body.reason.trim()    : '';
    const signupIdParam = typeof body.signupId  === 'string' ? body.signupId.trim()  : '';
    const isLateCancellation = new Date() > raid.signupUntil;

    const whereUnreg = {
      raidId,
      userId: user.id,
      ...(signupIdParam ? { id: signupIdParam } : {}),
    };
    const removedRows = await prisma.rfRaidSignup.findMany({
      where:   whereUnreg,
      include: { character: { select: { name: true } } },
    });

    if (removedRows.length === 0) {
      return NextResponse.json({ error: 'NOT_SIGNED_UP', message: 'Keine Anmeldung gefunden.' }, { status: 404 });
    }

    const needsAnnouncedReason =
      raid.status === 'announced' && removedRows.some((r) => r.setConfirmed);
    if (needsAnnouncedReason || isLateCancellation) {
      if (reason.length < ANNOUNCED_SET_PLAYER_COMMENT_MIN) {
        return NextResponse.json(
          {
            error: 'REASON_REQUIRED',
            message: needsAnnouncedReason
              ? `Als gesetzter Spieler ist eine Begründung nötig (mind. ${ANNOUNCED_SET_PLAYER_COMMENT_MIN} Zeichen).`
              : 'Nach dem Anmeldeschluss ist eine Begründung für die Abmeldung erforderlich.',
          },
          { status: 400 }
        );
      }
    }

    const unregActorLabel =
      typeof body.discordUserLabel === 'string' ? body.discordUserLabel.trim() : '';

    const { withdrawRaidSignupRows } = await import('@/lib/raid-signup-withdraw');
    await withdrawRaidSignupRows(prisma, {
      raidId,
      signupIds: removedRows.map((r) => r.id),
      changedByUserId: user.id,
      guildId: raid.guildId,
    });

    if (reason) {
      await prisma.rfAuditLog.create({
        data: {
          entityType: 'raid_signup',
          entityId: raidId,
          action: 'discord_unregister',
          changedByUserId: user.id,
          guildId: raid.guildId,
          raidId,
          newValue: JSON.stringify({ reason, isLateCancellation }),
        },
      }).catch(() => {});
    }

    await syncRaidThreadSummary(raidId, { embedOnly: true });
    for (const row of removedRows) {
      await postSignupChangeThreadNotice(raidId, 'unsignup', {
        characterName: row.character?.name ?? null,
        signedSpec: row.signedSpec,
        type: 'declined',
        punctuality: row.punctuality,
      });
      if (raid.status === 'announced' && row.setConfirmed) {
        await tryNotifyAnnouncedSetPlayerChange({
          raidId,
          guildId: raid.guildId,
          userId: user.id,
          actorLabel: unregActorLabel || undefined,
          kind: 'unsignup',
          characterName: row.character?.name ?? '?',
          previous: snapFromSignupRow(row),
          comment: reason,
        });
      }
    }
    return NextResponse.json({ ok: true, message: 'Abmeldung erfolgreich.' });
  }

  // -------------------------------------------------------------------------
  // RaidTools: Beitrag synchronisieren
  // -------------------------------------------------------------------------
  if (action === 'sync-post') {
    if (!access.canEdit) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Nur Raidleader oder Gildenmeister dürfen RaidTools nutzen.' },
        { status: 403 }
      );
    }
    try {
      await syncRaidThreadSummary(raidId);
      return NextResponse.json({ ok: true, message: 'Discord-Beitrag wurde aktualisiert.' });
    } catch (e) {
      console.error('[discord-action sync-post]', raidId, e);
      return NextResponse.json(
        { error: 'SYNC_FAILED', message: 'Beitrag konnte nicht synchronisiert werden.' },
        { status: 500 }
      );
    }
  }

  // -------------------------------------------------------------------------
  // RaidTools: Raid pushen (neu posten)
  // -------------------------------------------------------------------------
  if (action === 'push-raid') {
    if (!access.canEdit) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Nur Raidleader oder Gildenmeister dürfen RaidTools nutzen.' },
        { status: 403 }
      );
    }
    try {
      await pushRaidDiscordPost(raidId);
      return NextResponse.json({ ok: true, message: 'Raid wurde nach unten gepusht.' });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      if (err === 'NO_DISCORD_POST') {
        return NextResponse.json(
          { error: 'NO_DISCORD_POST', message: 'Kein Discord-Beitrag für diesen Raid vorhanden.' },
          { status: 400 }
        );
      }
      if (err === 'RAID_NOT_PUSHABLE') {
        return NextResponse.json(
          { error: 'RAID_NOT_PUSHABLE', message: 'Abgeschlossene oder abgesagte Raids können nicht gepusht werden.' },
          { status: 400 }
        );
      }
      console.error('[discord-action push-raid]', raidId, e);
      return NextResponse.json(
        { error: 'PUSH_FAILED', message: 'Raid konnte nicht gepusht werden.' },
        { status: 500 }
      );
    }
  }

  // -------------------------------------------------------------------------
  // RaidTools: Push mit Raider-Erwähnung im Channel
  // -------------------------------------------------------------------------
  if (action === 'push-raid-mention') {
    if (!access.canEdit) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Nur Raidleader oder Gildenmeister dürfen RaidTools nutzen.' },
        { status: 403 }
      );
    }
    const mentionText = typeof body.mentionText === 'string' ? body.mentionText.trim() : '';
    if (!mentionText) {
      return NextResponse.json(
        { error: 'MESSAGE_EMPTY', message: 'Bitte einen Nachrichtentext eingeben.' },
        { status: 400 }
      );
    }
    try {
      await postRaidRaiderChannelMention(raidId, mentionText);
      await pushRaidDiscordPost(raidId);
      return NextResponse.json({
        ok: true,
        message: 'Erwähnung gesendet und Raid wurde nach unten gepusht.',
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      if (err === 'NO_DISCORD_CHANNEL') {
        return NextResponse.json(
          { error: 'NO_DISCORD_CHANNEL', message: 'Kein Discord-Channel für diesen Raid hinterlegt.' },
          { status: 400 }
        );
      }
      if (err === 'MESSAGE_EMPTY') {
        return NextResponse.json(
          { error: 'MESSAGE_EMPTY', message: 'Bitte einen Nachrichtentext eingeben.' },
          { status: 400 }
        );
      }
      if (err === 'NO_DISCORD_POST' || err === 'RAID_NOT_PUSHABLE' || err === 'PUSH_FAILED') {
        return NextResponse.json(
          {
            error: err,
            message:
              err === 'NO_DISCORD_POST'
                ? 'Kein Discord-Beitrag für diesen Raid vorhanden.'
                : err === 'RAID_NOT_PUSHABLE'
                  ? 'Abgeschlossene oder abgesagte Raids können nicht gepusht werden.'
                  : 'Raid konnte nicht gepusht werden.',
          },
          { status: err === 'NO_DISCORD_POST' || err === 'RAID_NOT_PUSHABLE' ? 400 : 500 }
        );
      }
      console.error('[discord-action push-raid-mention]', raidId, e);
      return NextResponse.json(
        { error: 'PUSH_FAILED', message: 'Push mit Erwähnung fehlgeschlagen.' },
        { status: 500 }
      );
    }
  }

  // -------------------------------------------------------------------------
  // Info @ Raidlead
  // -------------------------------------------------------------------------
  if (action === 'leader-info') {
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    const discordUserLabel =
      typeof body.discordUserLabel === 'string' ? body.discordUserLabel.trim() : '';
    if (!message) {
      return NextResponse.json(
        { error: 'MESSAGE_EMPTY', message: 'Bitte eine Nachricht eingeben.' },
        { status: 400 }
      );
    }
    if (!discordUserLabel) {
      return NextResponse.json({ error: 'Missing discordUserLabel' }, { status: 400 });
    }
    try {
      await postRaidLeaderChannelInfo(raidId, discordUserLabel, message);
      return NextResponse.json({ ok: true, message: 'Nachricht wurde an den Raidleader-Kanal gesendet.' });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      if (err === 'NO_LEADER_CHANNEL') {
        return NextResponse.json(
          {
            error: 'NO_LEADER_CHANNEL',
            message: 'Für diesen Raid ist kein Raidleader-Kanal hinterlegt.',
          },
          { status: 400 }
        );
      }
      if (err === 'MESSAGE_EMPTY') {
        return NextResponse.json(
          { error: 'MESSAGE_EMPTY', message: 'Bitte eine Nachricht eingeben.' },
          { status: 400 }
        );
      }
      console.error('[discord-action leader-info]', raidId, e);
      return NextResponse.json(
        { error: 'POST_FAILED', message: 'Nachricht konnte nicht gesendet werden.' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
