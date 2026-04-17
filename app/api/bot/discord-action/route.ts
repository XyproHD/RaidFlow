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
import { syncRaidThreadSummary } from '@/lib/raid-thread-sync';
import { getAppConfig } from '@/lib/app-config';

/**
 * Discord-Interaktions-API (aufgerufen durch discord-bot nach Button-/Modal-Interaktionen).
 *
 * POST /api/bot/discord-action
 * Aktionen:
 *   quickjoin       – Main-Char, Standard-Bedingungen, pünktlich, keine Notiz
 *   join            – Eigene Anmeldung (characterId, type, signedSpec, note, punctuality)
 *   edit-signup     – Bestehende Anmeldung bearbeiten (gleiche Felder wie join)
 *   unregister      – Abmelden (optional: reason für späte Absage)
 *
 * GET /api/bot/discord-action?action=get-signup&discordUserId=...&raidId=...
 *   Gibt aktuelle Anmeldedaten zurück (für Edit-Modal pre-fill).
 *
 * GET /api/bot/discord-action?action=get-chars&discordUserId=...&raidId=...
 *   Gibt Charaktere des Users für die Gilde des Raids zurück.
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

  if (!discordUserId || !raidId) {
    return NextResponse.json({ error: 'Missing discordUserId or raidId' }, { status: 400 });
  }

  const raid = await prisma.rfRaid.findUnique({
    where:  { id: raidId },
    select: { id: true, guildId: true, signupUntil: true },
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

  if (action === 'get-signup') {
    const [signup, appCfg] = await Promise.all([
      prisma.rfRaidSignup.findFirst({
        where: { raidId, userId: user.id },
        include: {
          character: { select: { id: true, name: true, mainSpec: true, offSpec: true, isMain: true } },
        },
      }),
      getAppConfig().catch(() => null),
    ]);
    const discordEmojis = appCfg?.discordEmojis ?? {};
    if (!signup) {
      return NextResponse.json({ linked: true, signup: null, discordEmojis });
    }
    return NextResponse.json({
      linked: true,
      discordEmojis,
      signup: {
        id:          signup.id,
        type:        signup.type,
        signedSpec:  signup.signedSpec,
        punctuality: signup.punctuality,
        note:        signup.note,
        isLate:      signup.isLate,
        character: signup.character
          ? {
              id:       signup.character.id,
              name:     signup.character.name,
              mainSpec: signup.character.mainSpec,
              offSpec:  signup.character.offSpec,
              isMain:   signup.character.isMain,
            }
          : null,
      },
      signupUntil: raid.signupUntil.toISOString(),
    });
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
    return NextResponse.json({ linked: true, guildId: raid.guildId, characters: chars, discordEmojis: appCfg?.discordEmojis ?? {} });
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

  // User-Lookup
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

  // Raid-Lookup (guildId aus raidId ableiten)
  const raid = await prisma.rfRaid.findUnique({
    where:  { id: raidId },
    select: { id: true, guildId: true, status: true, signupUntil: true },
  });
  if (!raid) {
    return NextResponse.json({ error: 'Raid not found' }, { status: 404 });
  }

  // Zugriff prüfen
  const access = await resolveRaidAccess(user.id, discordUserId, raid.guildId, raidId);
  if (!access.ok) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
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

    const existing = await prisma.rfRaidSignup.count({ where: { raidId, userId: user.id } });
    if (existing > 0) {
      return NextResponse.json({ error: 'ALREADY_SIGNED_UP', message: 'Du bist bereits angemeldet.' }, { status: 409 });
    }

    const phase = computeRaidSignupPhase(raid);
    const main  = await prisma.rfCharacter.findFirst({
      where:   { userId: user.id, guildId: raid.guildId, isMain: true },
      select:  { id: true, mainSpec: true },
      orderBy: { updatedAt: 'desc' },
    });
    const fallback = !main
      ? await prisma.rfCharacter.findFirst({
          where:   { userId: user.id, guildId: raid.guildId },
          select:  { id: true, mainSpec: true },
          orderBy: { updatedAt: 'desc' },
        })
      : null;
    const picked = main ?? fallback;
    if (!picked) {
      return NextResponse.json({ error: 'NO_CHARACTER', message: 'Kein Charakter in dieser Gilde gefunden.' }, { status: 400 });
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

    await syncRaidThreadSummary(raidId);
    return NextResponse.json({ ok: true, message: 'Quickjoin erfolgreich!' });
  }

  // -------------------------------------------------------------------------
  // Join / Edit-Signup
  // -------------------------------------------------------------------------
  if (action === 'join' || action === 'edit-signup') {
    if (action === 'join' && !access.canSignup) {
      return NextResponse.json(
        { error: 'SIGNUP_CLOSED', message: 'Anmeldung ist geschlossen oder Raid nicht mehr offen.' },
        { status: 403 }
      );
    }

    const characterId   = typeof body.characterId   === 'string' ? body.characterId.trim()   : '';
    const typeRaw       = typeof body.type          === 'string' ? body.type.trim()           : 'normal';
    const signedSpecRaw = typeof body.signedSpec    === 'string' ? body.signedSpec.trim()     : '';
    const noteRaw       = typeof body.note          === 'string' ? body.note.trim()           : '';
    const punctualityRaw = typeof body.punctuality  === 'string' ? body.punctuality.trim()    : 'on_time';

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
      select: { id: true, mainSpec: true, offSpec: true },
    });
    if (!char) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    const effectiveSpec = signedSpecRaw || char.mainSpec;
    const phase = computeRaidSignupPhase(raid);

    const validation = validateRaidSignupBusinessRules({
      phase,
      typeNorm,
      forbidReserve: false,
      punctuality,
      note:              noteRaw,
      signedSpecRaw:     effectiveSpec,
      characterMainSpec: char.mainSpec,
      characterOffSpec:  char.offSpec ?? null,
    });
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    const { signup, isCreate } = await commitRaidSelfSignupMutation({
      raidId,
      guildId:        raid.guildId,
      userId:         user.id,
      changedByUserId: user.id,
      characterId:    char.id,
      typeNorm,
      signedSpecRaw:  effectiveSpec,
      onlySignedSpec: false,
      forbidReserve:  false,
      punctuality,
      note:           noteRaw,
    });

    await syncRaidThreadSummary(raidId);
    return NextResponse.json({
      ok: true,
      isCreate,
      message: isCreate ? 'Anmeldung erfolgreich!' : 'Anmeldung aktualisiert!',
    });
  }

  // -------------------------------------------------------------------------
  // Abmelden (Unregister)
  // -------------------------------------------------------------------------
  if (action === 'unregister') {
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const isLateCancellation = new Date() > raid.signupUntil;

    if (isLateCancellation && !reason) {
      return NextResponse.json(
        { error: 'REASON_REQUIRED', message: 'Nach dem Anmeldeschluss ist eine Begründung für die Abmeldung erforderlich.' },
        { status: 400 }
      );
    }

    const deleted = await prisma.rfRaidSignup.deleteMany({
      where: { raidId, userId: user.id },
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: 'NOT_SIGNED_UP', message: 'Keine Anmeldung gefunden.' }, { status: 404 });
    }

    if (reason) {
      await prisma.rfAuditLog.create({
        data: {
          entityType:     'raid_signup',
          entityId:       raidId,
          action:         'discord_unregister',
          changedByUserId: user.id,
          guildId:        raid.guildId,
          raidId,
          newValue:       JSON.stringify({ reason, isLateCancellation }),
        },
      }).catch(() => { /* Audit-Fehler sind nicht kritisch */ });
    }

    await syncRaidThreadSummary(raidId);
    return NextResponse.json({ ok: true, message: 'Abmeldung erfolgreich.' });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
