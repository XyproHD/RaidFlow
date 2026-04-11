import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { verifyBotSecret } from '@/lib/bot-auth';
import { ensureUserIdForDiscordId } from '@/lib/ensure-discord-user';
import {
  BattlenetCharacterRequestError,
  fetchClassicCharacterFromBattlenetByRealm,
} from '@/lib/battlenet';
import {
  battlenetProfileJsonToUpsertData,
  classicFetchResultToJson,
  isBattlenetProfileJson,
  type BattlenetProfileJson,
} from '@/lib/battlenet-character-persist';
import { loadRfBattlenetRealmRow, realmRowToBattlenetRealmArg } from '@/lib/battlenet-realm-resolve';
import { assertBattlenetProfileForNewCharacter } from '@/lib/character-battlenet-requirements';
import { characterToClientDto } from '@/lib/character-api-dto';
import { findUniqueRfCharacterForProfileDto } from '@/lib/rf-character-gear-score-compat';
import { getGuildsForUser } from '@/lib/user-guilds';

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

function displayNameFromProfileLower(lower: string): string {
  if (!lower) return '';
  return lower
    .split(/\s+/)
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

/**
 * POST /api/bot/guilds/[guildId]/characters
 * Discord-Bot: Charakter anlegen (gleiche Prüfungen wie Web, inkl. Battle.net-Level).
 * Auth: BOT_SETUP_SECRET.
 *
 * Battle.net-Daten: entweder `battlenetProfile` (JSON wie Web) **oder** `realmId` + `characterName`
 * (Server löst per Battle.net auf). `name` / `mainSpec` optional — Defaults aus Profil.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { guildId } = await params;
  const guild = await prisma.rfGuild.findFirst({ where: { id: guildId }, select: { id: true } });
  if (!guild) {
    return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const discordUserId = readDiscordUserId(request, body);
  if (!discordUserId) {
    return NextResponse.json(
      { error: 'Missing discordUserId (body oder Query discordUserId / discordId)' },
      { status: 400 }
    );
  }

  const userId = await ensureUserIdForDiscordId(discordUserId);
  const userGuilds = await getGuildsForUser(userId, discordUserId);
  const allowedGuildIds = new Set(userGuilds.map((g) => g.id));

  if (userGuilds.length > 0) {
    if (!allowedGuildIds.has(guildId)) {
      return NextResponse.json(
        { error: 'Bitte eine Gilde aus den Discord-Servern des Users wählen.' },
        { status: 400 }
      );
    }
  } else if (!allowedGuildIds.has(guildId)) {
    return NextResponse.json({ error: 'Ungültige Gilde.' }, { status: 400 });
  }

  let battlenetProfile: BattlenetProfileJson | null = null;
  let defaultName = '';
  let defaultMainSpec = '';

  const realmId = typeof body.realmId === 'string' ? body.realmId.trim() : '';
  const rawCharName =
    typeof body.characterName === 'string'
      ? body.characterName
      : typeof body.name === 'string'
        ? body.name
        : '';
  const characterNameForResolve = typeof rawCharName === 'string' ? rawCharName.trim() : '';

  const appLocale = typeof body.appLocale === 'string' ? body.appLocale.trim() : undefined;

  if (isBattlenetProfileJson(body.battlenetProfile)) {
    battlenetProfile = body.battlenetProfile;
    defaultName = displayNameFromProfileLower(battlenetProfile.characterNameLower);
    defaultMainSpec = (battlenetProfile.activeSpecName ?? '').trim();
  } else if (realmId && characterNameForResolve) {
    try {
      const realm = await loadRfBattlenetRealmRow(realmId);
      if (!realm) {
        return NextResponse.json({ error: 'Realm nicht gefunden.' }, { status: 404 });
      }
      const fetched = await fetchClassicCharacterFromBattlenetByRealm(
        realmRowToBattlenetRealmArg(realm, appLocale),
        characterNameForResolve
      );
      const { characterName: resolvedName, mainSpec, profile } = classicFetchResultToJson(fetched);
      battlenetProfile = profile;
      defaultName = resolvedName;
      defaultMainSpec = mainSpec;
    } catch (err) {
      if (err instanceof BattlenetCharacterRequestError) {
        return NextResponse.json(
          {
            error: err.message,
            battlenetDebug: err.battlenetDebug,
            notFound: err.battlenetDebug.httpStatus === 404,
          },
          { status: err.battlenetDebug.httpStatus === 404 ? 404 : 502 }
        );
      }
      const message = err instanceof Error ? err.message : 'Battle.net Abfrage fehlgeschlagen';
      return NextResponse.json({ error: message }, { status: 502 });
    }
  } else {
    return NextResponse.json(
      {
        error:
          'Battle.net erforderlich: battlenetProfile (wie Web) oder realmId + characterName zur Auflösung.',
      },
      { status: 400 }
    );
  }

  const bnetCheck = assertBattlenetProfileForNewCharacter(battlenetProfile);
  if (!bnetCheck.ok) {
    return NextResponse.json({ error: bnetCheck.error, code: 'BNET_LEVEL_OR_PROFILE' }, { status: 400 });
  }

  const name = (typeof body.name === 'string' ? body.name.trim() : '') || defaultName;
  const mainSpec = (typeof body.mainSpec === 'string' ? body.mainSpec.trim() : '') || defaultMainSpec;
  const offSpec =
    typeof body.offSpec === 'string' && body.offSpec.trim() ? body.offSpec.trim() : null;

  if (!name || !mainSpec) {
    return NextResponse.json(
      { error: 'name und mainSpec konnten nicht ermittelt werden — bitte setzen.' },
      { status: 400 }
    );
  }

  try {
    const createdId = await prisma.$transaction(async (tx) => {
      const created = await tx.rfCharacter.create({
        data: {
          userId,
          name,
          guildId,
          mainSpec,
          offSpec,
          isMain: false,
        },
      });
      const data = battlenetProfileJsonToUpsertData(battlenetProfile!);
      await tx.rfBattlenetCharacterProfile.upsert({
        where: { characterId: created.id },
        create: { characterId: created.id, ...data },
        update: data,
      });
      return created.id;
    });
    const saved = await findUniqueRfCharacterForProfileDto(createdId);
    return NextResponse.json({ character: characterToClientDto(saved) }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json(
        { error: 'Dieser Battle.net-Charakter ist bereits einem anderen Eintrag zugeordnet.' },
        { status: 409 }
      );
    }
    const message = err instanceof Error ? err.message : 'Speichern fehlgeschlagen';
    console.error('[bot/guilds/characters POST]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
