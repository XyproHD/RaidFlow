import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireGuildMasterOrForbid } from '@/lib/guild-master';
import { createGuildRole } from '@/lib/discord-guild-api';

const ROLE_PREFIX = 'Raidflowgroup-';

/**
 * GET /api/guilds/[guildId]/raid-groups
 * Liste der Raidgruppen der Gilde. Nur für Gildenmeister.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const { guildId } = await params;
  const auth = await requireGuildMasterOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  const groups = await prisma.rfRaidGroup.findMany({
    where: { guildId },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  return NextResponse.json({ raidGroups: groups });
}

/**
 * POST /api/guilds/[guildId]/raid-groups
 * Neue Raidgruppe anlegen: Rolle auf Discord erstellen, dann in DB speichern.
 * Body: { name: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const { guildId } = await params;
  const auth = await requireGuildMasterOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'Missing or empty name' }, { status: 400 });
  }

  const guild = await prisma.rfGuild.findUnique({
    where: { id: guildId },
  });
  if (!guild) {
    return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
  }

  const existing = await prisma.rfRaidGroup.findFirst({
    where: { guildId, name },
  });
  if (existing) {
    return NextResponse.json(
      { error: 'A raid group with this name already exists' },
      { status: 409 }
    );
  }

  try {
    const roleName = `${ROLE_PREFIX}${name}`;
    const discordRoleId = await createGuildRole(guild.discordGuildId, roleName);

    const maxOrder = await prisma.rfRaidGroup
      .aggregate({ where: { guildId }, _max: { sortOrder: true } })
      .then((r) => r._max.sortOrder ?? -1);

    const raidGroup = await prisma.rfRaidGroup.create({
      data: {
        guildId,
        name,
        discordRoleId,
        sortOrder: maxOrder + 1,
      },
    });

    return NextResponse.json({ raidGroup });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[API guilds raid-groups POST]', e);
    return NextResponse.json(
      {
        error: 'Failed to create raid group',
        detail: process.env.NODE_ENV === 'development' ? message : undefined,
      },
      { status: 500 }
    );
  }
}
