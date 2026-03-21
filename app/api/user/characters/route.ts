import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { characterToClientDto } from '@/lib/character-api-dto';
import {
  battlenetProfileJsonToUpsertData,
  isBattlenetProfileJson,
} from '@/lib/battlenet-character-persist';

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
  const list = await prisma.rfCharacter.findMany({
    where: { userId },
    include: characterInclude,
    orderBy: { name: 'asc' },
  });
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
  if (bnet !== null && !isBattlenetProfileJson(bnet)) {
    return NextResponse.json({ error: 'Ungültiges battlenetProfile' }, { status: 400 });
  }
  try {
    const saved = await prisma.$transaction(async (tx) => {
      const created = await tx.rfCharacter.create({
        data: {
          userId,
          name: name.trim(),
          guildId: guildId || null,
          mainSpec: mainSpec.trim(),
          offSpec: offSpec?.trim() || null,
          isMain: false,
        },
      });
      if (bnet) {
        const data = battlenetProfileJsonToUpsertData(bnet);
        await tx.rfBattlenetCharacterProfile.upsert({
          where: { characterId: created.id },
          create: { characterId: created.id, ...data },
          update: data,
        });
      }
      return tx.rfCharacter.findUniqueOrThrow({
        where: { id: created.id },
        include: characterInclude,
      });
    });
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
