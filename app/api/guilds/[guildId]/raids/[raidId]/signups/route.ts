import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { prisma } from '@/lib/prisma';
import { resolveRaidAccess } from '@/lib/raid-detail-access';

const SIGNUP_TYPES = new Set(['main', 'reserve']);

/**
 * POST /api/guilds/[guildId]/raids/[raidId]/signups
 * Anmeldung anlegen/aktualisieren (ein Eintrag pro User pro Raid).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string; raidId: string }> }
) {
  const { guildId, raidId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.discordId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = await getEffectiveUserId(
    session as { userId?: string; discordId?: string }
  );
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const access = await resolveRaidAccess(
    userId,
    session.discordId as string,
    guildId,
    raidId
  );
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

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const characterId =
    typeof body.characterId === 'string' ? body.characterId.trim() : '';
  const type = typeof body.type === 'string' ? body.type.trim() : '';
  const allowReserve =
    typeof body.allowReserve === 'boolean' ? body.allowReserve : false;

  if (!characterId || !SIGNUP_TYPES.has(type)) {
    return NextResponse.json(
      { error: 'Missing or invalid characterId / type (main | reserve)' },
      { status: 400 }
    );
  }

  const character = await prisma.rfCharacter.findFirst({
    where: { id: characterId, userId, guildId },
    select: { id: true },
  });
  if (!character) {
    return NextResponse.json(
      { error: 'Character not found for this guild' },
      { status: 400 }
    );
  }

  const existing = await prisma.rfRaidSignup.findFirst({
    where: { raidId, userId },
  });

  if (existing) {
    const updated = await prisma.rfRaidSignup.update({
      where: { id: existing.id },
      data: {
        characterId,
        type,
        allowReserve,
      },
      select: { id: true, type: true, characterId: true, signedAt: true },
    });
    return NextResponse.json({ signup: updated });
  }

  const created = await prisma.rfRaidSignup.create({
    data: {
      raidId,
      userId,
      characterId,
      type,
      allowReserve,
    },
    select: { id: true, type: true, characterId: true, signedAt: true },
  });
  return NextResponse.json({ signup: created }, { status: 201 });
}
