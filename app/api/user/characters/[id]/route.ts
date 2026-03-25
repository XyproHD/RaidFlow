import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { characterToClientDto } from '@/lib/character-api-dto';
import { findUniqueRfCharacterForProfileDto } from '@/lib/rf-character-gear-score-compat';
import {
  battlenetProfileJsonToUpsertData,
  isBattlenetProfileJson,
} from '@/lib/battlenet-character-persist';

const characterInclude = {
  guild: { select: { id: true, name: true } as const },
  battlenetProfile: { select: { battlenetCharacterId: true, realmSlug: true } as const },
} as const;

/** PATCH: Charakter aktualisieren */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  let body: {
    name?: string;
    guildId?: string | null;
    mainSpec?: string;
    offSpec?: string | null;
    isMain?: boolean;
    battlenetProfile?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const bnet =
    body.battlenetProfile !== undefined && body.battlenetProfile !== null
      ? body.battlenetProfile
      : null;
  if (bnet !== null && !isBattlenetProfileJson(bnet)) {
    return NextResponse.json({ error: 'Ungültiges battlenetProfile' }, { status: 400 });
  }
  const existing = await prisma.rfCharacter.findFirst({
    where: { id, userId },
    select: { id: true, guildId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const nextGuildId =
    body.guildId !== undefined ? body.guildId || null : existing.guildId;
  const guildIdChanged = body.guildId !== undefined && nextGuildId !== existing.guildId;
  if (body.isMain === true && existing.guildId) {
    await prisma.rfCharacter.updateMany({
      where: { userId, guildId: existing.guildId, id: { not: id } },
      data: { isMain: false },
    });
  }
  try {
    await prisma.$transaction(async (tx) => {
      const charUpdate: Prisma.RfCharacterUncheckedUpdateInput = {};
      if (body.name != null) charUpdate.name = body.name.trim();
      if (body.guildId !== undefined) {
        charUpdate.guildId = body.guildId || null;
        if (guildIdChanged) charUpdate.guildDiscordDisplayName = null;
      }
      if (body.mainSpec != null) charUpdate.mainSpec = body.mainSpec.trim();
      if (body.offSpec !== undefined) charUpdate.offSpec = body.offSpec?.trim() || null;
      if (body.isMain !== undefined) charUpdate.isMain = !!body.isMain;
      if (Object.keys(charUpdate).length > 0) {
        await tx.rfCharacter.update({ where: { id }, data: charUpdate });
      }
      if (bnet) {
        const data = battlenetProfileJsonToUpsertData(bnet);
        await tx.rfBattlenetCharacterProfile.upsert({
          where: { characterId: id },
          create: { characterId: id, ...data },
          update: data,
        });
      }
    });
    const updated = await findUniqueRfCharacterForProfileDto(id);
    return NextResponse.json({ character: characterToClientDto(updated) });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json(
        { error: 'Dieser Battle.net-Charakter ist bereits einem anderen Eintrag zugeordnet.' },
        { status: 409 }
      );
    }
    console.error('Character PATCH failed:', err);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}

/** DELETE: Charakter löschen */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const existing = await prisma.rfCharacter.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await prisma.rfCharacter.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
