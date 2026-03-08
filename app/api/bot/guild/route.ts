import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBotSecret } from '@/lib/bot-auth';

/**
 * POST /api/bot/guild
 * Bot ruft nach /raidflow setup auf: Guild anlegen/aktualisieren inkl. Rollen-IDs.
 * Auth: BOT_SETUP_SECRET (Header Authorization: Bearer <secret> oder X-Bot-Setup-Secret).
 */
export async function POST(request: Request) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    discordGuildId: string;
    name: string;
    discordRoleGuildmasterId: string;
    discordRoleRaidleaderId: string;
    discordRoleRaiderId: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { discordGuildId, name, discordRoleGuildmasterId, discordRoleRaidleaderId, discordRoleRaiderId } = body;
  if (!discordGuildId || !name || !discordRoleGuildmasterId || !discordRoleRaidleaderId || !discordRoleRaiderId) {
    return NextResponse.json(
      { error: 'Missing: discordGuildId, name, discordRoleGuildmasterId, discordRoleRaidleaderId, discordRoleRaiderId' },
      { status: 400 }
    );
  }

  try {
    const guild = await prisma.rfGuild.upsert({
      where: { discordGuildId },
      create: {
        discordGuildId,
        name,
        discordRoleGuildmasterId,
        discordRoleRaidleaderId,
        discordRoleRaiderId,
        botInviteStatus: 'invited',
      },
      update: {
        name,
        discordRoleGuildmasterId,
        discordRoleRaidleaderId,
        discordRoleRaiderId,
        botInviteStatus: 'invited',
      },
    });
    return NextResponse.json({ ok: true, guildId: guild.id });
  } catch (e) {
    console.error('[API bot/guild]', e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
