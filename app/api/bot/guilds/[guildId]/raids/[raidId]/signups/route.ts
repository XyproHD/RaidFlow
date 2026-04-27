import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBotSecret } from '@/lib/bot-auth';
import { ensureUserIdForDiscordId } from '@/lib/ensure-discord-user';
import { pickCharacterForRaidSignup } from '@/lib/bot-pick-signup-character';
import { computeRaidSignupPhase, resolveRaidAccess } from '@/lib/raid-detail-access';
import { normalizeSignupPunctuality, normalizeSignupType } from '@/lib/raid-signup-constants';
import {
  commitRaidSelfSignupMutation,
  validateRaidSignupBusinessRules,
} from '@/lib/raid-self-signup-mutation';
import { syncRaidThreadSummary, postSignupChangeThreadNotice } from '@/lib/raid-thread-sync';

function readDiscordUserId(request: NextRequest, body: Record<string, unknown>): string {
  const q = request.nextUrl.searchParams.get('discordUserId')?.trim();
  if (q) return q;
  const q2 = request.nextUrl.searchParams.get('discordId')?.trim();
  if (q2) return q2;
  const a = typeof body.discordUserId === 'string' ? body.discordUserId.trim() : '';
  if (a) return a;
  const b = typeof body.discordId === 'string' ? body.discordId.trim() : '';
  return b;
}

/**
 * POST /api/bot/guilds/[guildId]/raids/[raidId]/signups
 * Discord-Bot: Anmeldung mit optionalen Feldern (Standard: Main-Char, normal, pünktlich).
 * Auth: BOT_SETUP_SECRET (Authorization: Bearer … oder X-Bot-Setup-Secret).
 *
 * Mindestens `discordUserId` (Body oder Query) — alle weiteren Felder optional.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string; raidId: string }> }
) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { guildId, raidId } = await params;

  let body: Record<string, unknown> = {};
  try {
    const text = await request.text();
    if (text.trim()) body = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const discordUserId = readDiscordUserId(request, body);
  if (!discordUserId) {
    return NextResponse.json(
      { error: 'Missing discordUserId (body or query discordUserId / discordId)' },
      { status: 400 }
    );
  }

  const userId = await ensureUserIdForDiscordId(discordUserId);

  const access = await resolveRaidAccess(userId, discordUserId, guildId, raidId);
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

  const characterIdRaw =
    typeof body.characterId === 'string' && body.characterId.trim()
      ? body.characterId.trim()
      : null;

  const character = await pickCharacterForRaidSignup(userId, guildId, characterIdRaw);
  if (!character) {
    return NextResponse.json(
      {
        error: characterIdRaw
          ? 'Character not found for this guild'
          : 'No character in this guild — create one first (bot or web)',
      },
      { status: 400 }
    );
  }

  const typeRaw = typeof body.type === 'string' ? body.type.trim() : '';
  const typeNorm =
    typeRaw === ''
      ? phase === 'reserve_only'
        ? 'reserve'
        : 'normal'
      : normalizeSignupType(typeRaw);
  if (!typeNorm) {
    return NextResponse.json(
      { error: 'Invalid type (normal | uncertain | reserve)' },
      { status: 400 }
    );
  }

  const punctuality = normalizeSignupPunctuality(body.punctuality, body.isLate === true);
  const note =
    typeof body.note === 'string' ? body.note.trim() : body.note === null ? '' : '';
  const signedSpecRaw =
    typeof body.signedSpec === 'string' && body.signedSpec.trim()
      ? body.signedSpec.trim()
      : character.mainSpec;
  const onlySignedSpec = body.onlySignedSpec === true;
  const forbidReserve = body.forbidReserve === true;

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
  await postSignupChangeThreadNotice(raidId, isCreate ? 'signup' : 'edit', {
    characterName: character.name,
    signedSpec:    signedSpecRaw || null,
    type:          typeNorm,
    punctuality,
    note,
  });
  return NextResponse.json({ signup, signupPhase: phase }, { status: isCreate ? 201 : 200 });
}
