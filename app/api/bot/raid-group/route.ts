import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBotSecret } from '@/lib/bot-auth';

/**
 * POST /api/bot/raid-group
 * Bot ruft nach /raidflow group <Name> auf: RaidGroup anlegen/aktualisieren.
 * Auth: BOT_SETUP_SECRET.
 */
export async function POST(request: Request) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    discordGuildId: string;
    name: string;
    discordRoleId: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { discordGuildId, name, discordRoleId } = body;
  if (!discordGuildId || !name || !discordRoleId) {
    return NextResponse.json(
      { error: 'Missing: discordGuildId, name, discordRoleId' },
      { status: 400 }
    );
  }

  try {
    const guild = await prisma.rfGuild.findUnique({
      where: { discordGuildId },
    });
    if (!guild) {
      return NextResponse.json({ error: 'Guild not found. Run /raidflow setup first.' }, { status: 404 });
    }

    const existing = await prisma.rfRaidGroup.findFirst({
      where: { guildId: guild.id, name },
    });

    let raidGroup;
    if (existing) {
      raidGroup = await prisma.rfRaidGroup.update({
        where: { id: existing.id },
        data: { discordRoleId },
      });
    } else {
      const maxOrder = await prisma.rfRaidGroup
        .aggregate({ where: { guildId: guild.id }, _max: { sortOrder: true } })
        .then((r) => r._max.sortOrder ?? -1);
      raidGroup = await prisma.rfRaidGroup.create({
        data: {
          guildId: guild.id,
          name,
          discordRoleId,
          sortOrder: maxOrder + 1,
        },
      });
    }
    return NextResponse.json({ ok: true, raidGroupId: raidGroup.id });
  } catch (e) {
    console.error('[API bot/raid-group]', e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
