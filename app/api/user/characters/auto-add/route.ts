import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { fetchClassicCharacterFromBattlenetWithFilters } from '@/lib/battlenet';
import type { WowPreset, WowRegion } from '@/lib/wow-classic-realms';

function presetFromInternalWowVersion(v: string | null): WowPreset {
  if (v === 'anniversary') return 'tbc';
  if (v === 'progression') return 'mop';
  return 'classic';
}

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
      select: { region: true, wowVersion: true, realmName: true },
    });
    if (!realm) {
      return NextResponse.json({ error: 'Ausgewaehlter Realm wurde nicht gefunden.' }, { status: 400 });
    }

    const profile = await fetchClassicCharacterFromBattlenetWithFilters(
      realm.realmName,
      name,
      (realm?.region as WowRegion | undefined) ?? 'eu',
      presetFromInternalWowVersion(realm?.wowVersion ?? null)
    );

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
          rawProfile: profile.rawProfile,
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
        mainSpec: created.mainSpec,
        offSpec: created.offSpec,
        isMain: created.isMain,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Auto Add fehlgeschlagen';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
