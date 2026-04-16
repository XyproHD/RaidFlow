import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import {
  BattlenetCharacterRequestError,
  fetchClassicCharacterFromBattlenetByRealm,
} from '@/lib/battlenet';
import { loadRfBattlenetRealmRow, realmRowToBattlenetRealmArg } from '@/lib/battlenet-realm-resolve';
import {
  battlenetProfileJsonToUpsertData,
  classicFetchResultToJson,
} from '@/lib/battlenet-character-persist';
import { getGuildsForUserCached } from '@/lib/user-guilds';
import { assertBattlenetProfileForNewCharacter } from '@/lib/character-battlenet-requirements';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
  const discordId = (session as { discordId?: string } | null)?.discordId ?? null;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    realmId?: string;
    name?: string;
    guildId?: string | null;
    /** next-intl locale, e.g. `de` / `en` — used for realm display name fallback only */
    appLocale?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const realmId = body.realmId?.trim();
  const name = body.name?.trim();
  if (!realmId || !name) {
    return NextResponse.json({ error: 'Realm und Charaktername sind erforderlich.' }, { status: 400 });
  }

  try {
    const realm = await loadRfBattlenetRealmRow(realmId);
    if (!realm) {
      return NextResponse.json({ error: 'Ausgewaehlter Realm wurde nicht gefunden.' }, { status: 400 });
    }

    const fetched = await fetchClassicCharacterFromBattlenetByRealm(
      realmRowToBattlenetRealmArg(realm, body.appLocale),
      name
    );
    const { profile: profileJson, mainSpec, characterName } = classicFetchResultToJson(fetched);
    const bnetCheck = assertBattlenetProfileForNewCharacter(profileJson);
    if (!bnetCheck.ok) {
      return NextResponse.json(
        { error: bnetCheck.error, code: 'BNET_LEVEL_OR_PROFILE' },
        { status: 400 }
      );
    }

    const userGuilds = await getGuildsForUserCached(userId, discordId);
    const allowedGuildIds = new Set(userGuilds.map((g) => g.id));
    const nextGuildId = body.guildId || null;
    if (userGuilds.length > 0) {
      if (!nextGuildId || !allowedGuildIds.has(nextGuildId)) {
        return NextResponse.json(
          { error: 'Bitte eine Gilde aus deinen Discord-Servern wählen.' },
          { status: 400 }
        );
      }
    } else if (nextGuildId != null && !allowedGuildIds.has(nextGuildId)) {
      return NextResponse.json({ error: 'Ungültige Gilde.' }, { status: 400 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const shouldBeMain = nextGuildId
        ? !(await tx.rfCharacter.findFirst({
            where: { userId, guildId: nextGuildId },
            select: { id: true },
          }))
        : false;
      const character = await tx.rfCharacter.create({
        data: {
          userId,
          name: characterName,
          guildId: nextGuildId,
          mainSpec,
          offSpec: null,
          isMain: shouldBeMain,
        },
        include: { guild: { select: { id: true, name: true } } },
      });

      await tx.rfBattlenetCharacterProfile.create({
        data: {
          characterId: character.id,
          ...battlenetProfileJsonToUpsertData(profileJson),
        },
      });

      return character;
    });

    return NextResponse.json({
      character: {
        id: created.id,
        name: created.name,
        guildId: created.guildId,
        guildName: created.guild?.name ?? null,
        guildDiscordDisplayName: created.guildDiscordDisplayName,
        mainSpec: created.mainSpec,
        offSpec: created.offSpec,
        isMain: created.isMain,
        gearScore: created.gearScore ?? null,
        hasBattlenet: true,
      },
    });
  } catch (err) {
    if (err instanceof BattlenetCharacterRequestError) {
      return NextResponse.json(
        {
          error: err.message,
          battlenetDebug: err.battlenetDebug,
        },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : 'Auto Add fehlgeschlagen';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
