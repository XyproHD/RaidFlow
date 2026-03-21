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
import type { WowRegion } from '@/lib/wow-classic-realms';
import { appLocaleToBnetLocale, pickRealmNameFromJson, titleCaseFromSlug } from '@/lib/wow-realm-name';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
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
    const realm = await prisma.rfBattlenetRealm.findUnique({
      where: { id: realmId },
      select: { region: true, version: true, name: true, slug: true, namespace: true },
    });
    if (!realm) {
      return NextResponse.json({ error: 'Ausgewaehlter Realm wurde nicht gefunden.' }, { status: 400 });
    }

    const bnetLocale = appLocaleToBnetLocale(body.appLocale ?? 'en');
    const realmDisplay =
      pickRealmNameFromJson(realm.name, bnetLocale) || titleCaseFromSlug(realm.slug);

    const profile = await fetchClassicCharacterFromBattlenetByRealm({
      region: (realm?.region as WowRegion | undefined) ?? 'eu',
      namespace: realm.namespace,
      slug: realm.slug,
      version: realm.version,
      name: realmDisplay,
    }, name);

    const created = await prisma.$transaction(async (tx) => {
      const character = await tx.rfCharacter.create({
        data: {
          userId,
          name: profile.characterName,
          guildId: body.guildId || null,
          mainSpec: profile.mainSpec,
          offSpec: null,
          isMain: false,
        },
        include: { guild: { select: { id: true, name: true } } },
      });

      await tx.rfBattlenetCharacterProfile.create({
        data: {
          characterId: character.id,
          battlenetConfigId: profile.configId,
          region: profile.region,
          wowVersion: profile.wowVersion,
          realmSlug: profile.realmSlug,
          realmName: profile.realmName,
          characterNameLower: profile.characterNameLower,
          battlenetCharacterId: profile.battlenetCharacterId,
          level: profile.level,
          raceName: profile.raceName,
          className: profile.className,
          activeSpecName: profile.activeSpecName,
          guildName: profile.guildName,
          faction: profile.faction,
          profileUrl: profile.profileUrl,
          rawProfile: profile.rawProfile as Prisma.InputJsonValue,
          lastSyncedAt: new Date(),
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
