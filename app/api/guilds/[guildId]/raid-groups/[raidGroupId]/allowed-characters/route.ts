import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireGuildMasterOrForbid } from '@/lib/guild-master';

/**
 * GET /api/guilds/[guildId]/raid-groups/[raidGroupId]/allowed-characters
 * Pro Character in dieser Raidgruppe: ob er für Raid-Filter „zulässig“ ist (Default: true).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ guildId: string; raidGroupId: string }> }
) {
  const { guildId, raidGroupId } = await params;
  const auth = await requireGuildMasterOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  const group = await prisma.rfRaidGroup.findFirst({
    where: { id: raidGroupId, guildId },
  });
  if (!group) {
    return NextResponse.json({ error: 'Raid group not found' }, { status: 404 });
  }

  const members = await prisma.rfGuildMember.findMany({
    where: { guildId, raidGroupId },
    include: {
      user: {
        select: {
          characters: {
            where: { guildId },
            select: { id: true },
          },
        },
      },
    },
  });

  const characterIds = new Set<string>();
  for (const m of members) {
    for (const c of m.user.characters) {
      characterIds.add(c.id);
    }
  }

  const rows = await prisma.rfRaidGroupCharacter.findMany({
    where: { raidGroupId, characterId: { in: Array.from(characterIds) } },
    select: { characterId: true, allowed: true },
  });

  const allowed: Record<string, boolean> = {};
  for (const id of characterIds) {
    const row = rows.find((r) => r.characterId === id);
    allowed[id] = row?.allowed ?? true;
  }

  return NextResponse.json({ allowed });
}

/**
 * PATCH /api/guilds/[guildId]/raid-groups/[raidGroupId]/allowed-characters
 * Body: { characterId: string, allowed: boolean }
 * Mindestens ein Character pro User muss allowed bleiben.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ guildId: string; raidGroupId: string }> }
) {
  const { guildId, raidGroupId } = await params;
  const auth = await requireGuildMasterOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  let body: { characterId?: string; allowed?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const characterId = typeof body.characterId === 'string' ? body.characterId.trim() : '';
  const allowed = body.allowed === true || body.allowed === false ? body.allowed : undefined;
  if (!characterId || allowed === undefined) {
    return NextResponse.json(
      { error: 'Missing or invalid characterId or allowed' },
      { status: 400 }
    );
  }

  const group = await prisma.rfRaidGroup.findFirst({
    where: { id: raidGroupId, guildId },
  });
  if (!group) {
    return NextResponse.json({ error: 'Raid group not found' }, { status: 404 });
  }

  const character = await prisma.rfCharacter.findFirst({
    where: { id: characterId, guildId },
    select: { id: true, userId: true },
  });
  if (!character) {
    return NextResponse.json({ error: 'Character not found or not in this guild' }, { status: 404 });
  }

  const member = await prisma.rfGuildMember.findFirst({
    where: { guildId, raidGroupId, userId: character.userId },
  });
  if (!member) {
    return NextResponse.json({ error: 'Character’s user is not in this raid group' }, { status: 400 });
  }

  if (allowed === false) {
    const userCharsInGuild = await prisma.rfCharacter.findMany({
      where: { userId: character.userId, guildId },
      select: { id: true },
    });
    const allowedRows = await prisma.rfRaidGroupCharacter.findMany({
      where: {
        raidGroupId,
        characterId: { in: userCharsInGuild.map((c) => c.id) },
        allowed: true,
      },
    });
    const otherAllowed = allowedRows.filter((r) => r.characterId !== characterId);
    const currentRow = await prisma.rfRaidGroupCharacter.findUnique({
      where: {
        raidGroupId_characterId: { raidGroupId, characterId },
      },
    });
    const thisCharCurrentlyAllowed = currentRow?.allowed ?? true;
    if (thisCharCurrentlyAllowed && otherAllowed.length === 0) {
      return NextResponse.json(
        { error: 'At least one character per user must remain allowed in this raid group' },
        { status: 400 }
      );
    }
  }

  await prisma.rfRaidGroupCharacter.upsert({
    where: {
      raidGroupId_characterId: { raidGroupId, characterId },
    },
    create: { raidGroupId, characterId, allowed },
    update: { allowed },
  });

  return NextResponse.json({ ok: true, characterId, allowed });
}
