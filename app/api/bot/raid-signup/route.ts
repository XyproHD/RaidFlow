import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBotSecret } from '@/lib/bot-auth';
import { resolveRaidAccess, computeRaidSignupPhase } from '@/lib/raid-detail-access';
import { normalizeSignupType } from '@/lib/raid-signup-constants';
import { syncRaidThreadSummary, postSignupChangeThreadNotice } from '@/lib/raid-thread-sync';

/**
 * POST /api/bot/raid-signup
 * Body:
 * - { action: "create", discordUserId, guildId, raidId, mode: "oneclick" }
 * - { action: "create", discordUserId, guildId, raidId, mode: "custom", characterId, type }
 * - { action: "delete", discordUserId, guildId, raidId }
 *
 * Discord-Bot: Signup erstellen/löschen ohne User-Session (Auth: BOT_SETUP_SECRET).
 */
export async function POST(request: NextRequest) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: any = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = typeof body?.action === 'string' ? body.action.trim() : '';
  const discordUserId = typeof body?.discordUserId === 'string' ? body.discordUserId.trim() : '';
  const guildId = typeof body?.guildId === 'string' ? body.guildId.trim() : '';
  const raidId = typeof body?.raidId === 'string' ? body.raidId.trim() : '';
  const mode = typeof body?.mode === 'string' ? body.mode.trim() : '';

  if (!action || !discordUserId || !guildId || !raidId) {
    return NextResponse.json({ error: 'Missing action / discordUserId / guildId / raidId' }, { status: 400 });
  }

  const user = await prisma.rfUser.findUnique({
    where: { discordId: discordUserId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json(
      { error: 'NOT_LINKED', message: 'Discord-Konto ist nicht mit RaidFlow verknüpft.' },
      { status: 403 }
    );
  }

  const access = await resolveRaidAccess(user.id, discordUserId, guildId, raidId);
  if (!access.ok) {
    const status = access.reason === 'raid_not_found' ? 404 : 403;
    return NextResponse.json({ error: 'Forbidden' }, { status });
  }
  if (!access.canSignup && action !== 'delete') {
    return NextResponse.json({ error: 'Signup is closed for this raid' }, { status: 403 });
  }

  if (action === 'delete') {
    const toDelete = await prisma.rfRaidSignup.findFirst({
      where:   { raidId, userId: user.id },
      include: { character: { select: { name: true } } },
    });
    const deleted = await prisma.rfRaidSignup.deleteMany({
      where: { raidId, userId: user.id },
    });
    await syncRaidThreadSummary(raidId);
    if (toDelete) {
      void postSignupChangeThreadNotice(raidId, 'unsignup', {
        characterName: toDelete.character?.name ?? null,
        signedSpec:    toDelete.signedSpec,
        type:          toDelete.type,
        punctuality:   toDelete.punctuality,
      });
    }
    return NextResponse.json({ ok: true, deletedCount: deleted.count });
  }

  if (action !== 'create') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  }

  const raid = await prisma.rfRaid.findFirst({
    where: { id: raidId, guildId },
    select: { id: true, guildId: true, status: true, signupUntil: true },
  });
  if (!raid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const phase = computeRaidSignupPhase(raid);
  const existing = await prisma.rfRaidSignup.count({ where: { raidId, userId: user.id } });
  if (existing > 0) {
    return NextResponse.json({ error: 'ALREADY_SIGNED_UP' }, { status: 409 });
  }

  let characterId: string | null = null;
  let type: string = 'normal';

  if (mode === 'oneclick') {
    const main = await prisma.rfCharacter.findFirst({
      where: { userId: user.id, guildId, isMain: true },
      select: { id: true, name: true, mainSpec: true },
      orderBy: { updatedAt: 'desc' },
    });
    const fallback = !main
      ? await prisma.rfCharacter.findFirst({
          where: { userId: user.id, guildId },
          select: { id: true, name: true, mainSpec: true },
          orderBy: { updatedAt: 'desc' },
        })
      : null;
    const picked = main ?? fallback;
    if (!picked) {
      return NextResponse.json({ error: 'NO_CHARACTER', message: 'Kein Charakter in dieser Gilde gefunden.' }, { status: 400 });
    }
    characterId = picked.id;
    type = phase === 'reserve_only' ? 'reserve' : 'normal';

    await prisma.rfRaidSignup.create({
      data: {
        raidId,
        userId: user.id,
        characterId,
        type,
        punctuality: 'on_time',
        isLate: false,
        note: null,
        signedSpec: picked.mainSpec,
        onlySignedSpec: false,
        forbidReserve: false,
        allowReserve: false,
        leaderAllowsReserve: true,
        leaderMarkedTeilnehmer: false,
        leaderPlacement: 'signup',
        setConfirmed: false,
      },
    });
    await syncRaidThreadSummary(raidId);
    void postSignupChangeThreadNotice(raidId, 'signup', {
      characterName: picked.name,
      signedSpec:    picked.mainSpec,
      type,
      punctuality:   'on_time',
    });
    return NextResponse.json({ ok: true });
  }

  if (mode === 'custom') {
    const cid = typeof body?.characterId === 'string' ? body.characterId.trim() : '';
    const typeRaw = typeof body?.type === 'string' ? body.type.trim() : '';
    const typeNorm = normalizeSignupType(typeRaw);
    if (!cid || !typeNorm) {
      return NextResponse.json({ error: 'Missing/invalid characterId or type' }, { status: 400 });
    }
    if (phase === 'reserve_only' && typeNorm !== 'reserve') {
      return NextResponse.json({ error: 'After signup deadline only reserve is allowed' }, { status: 400 });
    }

    const ch = await prisma.rfCharacter.findFirst({
      where: { id: cid, userId: user.id, guildId },
      select: { id: true, name: true, mainSpec: true },
    });
    if (!ch) {
      return NextResponse.json({ error: 'Character not found for user/guild' }, { status: 404 });
    }

    await prisma.rfRaidSignup.create({
      data: {
        raidId,
        userId: user.id,
        characterId: ch.id,
        type: typeNorm,
        punctuality: 'on_time',
        isLate: false,
        note: null,
        signedSpec: ch.mainSpec,
        onlySignedSpec: false,
        forbidReserve: false,
        allowReserve: false,
        leaderAllowsReserve: true,
        leaderMarkedTeilnehmer: false,
        leaderPlacement: 'signup',
        setConfirmed: false,
      },
    });
    await syncRaidThreadSummary(raidId);
    void postSignupChangeThreadNotice(raidId, 'signup', {
      characterName: ch.name,
      signedSpec:    ch.mainSpec,
      type:          typeNorm,
      punctuality:   'on_time',
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Missing/invalid mode' }, { status: 400 });
}

