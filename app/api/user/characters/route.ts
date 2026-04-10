import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { characterToClientDto } from '@/lib/character-api-dto';
import {
  findManyRfCharactersForProfile,
  findUniqueRfCharacterForProfileDto,
} from '@/lib/rf-character-gear-score-compat';
import {
  battlenetProfileJsonToUpsertData,
  isBattlenetProfileJson,
} from '@/lib/battlenet-character-persist';
import { getGuildsForUserCached } from '@/lib/user-guilds';
import { assertBattlenetProfileForNewCharacter } from '@/lib/character-battlenet-requirements';

const characterInclude = {
  guild: { select: { id: true, name: true } as const },
  battlenetProfile: { select: { battlenetCharacterId: true, realmSlug: true } as const },
} as const;

/** GET: Charaktere des eingeloggten Users */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const list = await findManyRfCharactersForProfile(userId);
  return NextResponse.json({
    characters: list.map((c) => characterToClientDto(c)),
  });
}

/** POST: Neuen Charakter anlegen */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const discordId = (session as { discordId?: string } | null)?.discordId ?? null;
  let body: {
    name: string;
    guildId?: string | null;
    mainSpec: string;
    offSpec?: string | null;
    battlenetProfile?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { name, guildId, mainSpec, offSpec } = body;
  if (!name?.trim() || !mainSpec?.trim()) {
    return NextResponse.json(
      { error: 'name und mainSpec sind erforderlich' },
      { status: 400 }
    );
  }
  const bnet =
    body.battlenetProfile !== undefined && body.battlenetProfile !== null
      ? body.battlenetProfile
      : null;
  if (!isBattlenetProfileJson(bnet)) {
    return NextResponse.json(
      { error: 'Battle.net-Sync ist erforderlich (ungültiges oder fehlendes battlenetProfile).' },
      { status: 400 }
    );
  }
  const bnetCheck = assertBattlenetProfileForNewCharacter(bnet);
  if (!bnetCheck.ok) {
    return NextResponse.json({ error: bnetCheck.error, code: 'BNET_LEVEL_OR_PROFILE' }, { status: 400 });
  }

  const userGuilds = await getGuildsForUserCached(userId, discordId);
  const allowedGuildIds = new Set(userGuilds.map((g) => g.id));
  const nextGuildId = guildId || null;
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

  try {
    const createdId = await prisma.$transaction(async (tx) => {
      const created = await tx.rfCharacter.create({
        data: {
          userId,
          name: name.trim(),
          guildId: nextGuildId,
          mainSpec: mainSpec.trim(),
          offSpec: offSpec?.trim() || null,
          isMain: false,
        },
      });
      const data = battlenetProfileJsonToUpsertData(bnet);
      await tx.rfBattlenetCharacterProfile.upsert({
        where: { characterId: created.id },
        create: { characterId: created.id, ...data },
        update: data,
      });
      return created.id;
    });
    const saved = await findUniqueRfCharacterForProfileDto(createdId);
    return NextResponse.json({ character: characterToClientDto(saved) });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json(
        { error: 'Dieser Battle.net-Charakter ist bereits einem anderen Eintrag zugeordnet.' },
        { status: 409 }
      );
    }
    const message = err instanceof Error ? err.message : 'Speichern fehlgeschlagen';
    console.error('Character create failed:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
