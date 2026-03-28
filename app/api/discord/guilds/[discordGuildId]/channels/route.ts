import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getGuildChannels } from '@/lib/discord-guild-api';
import { requireGuildMasterOrForbid } from '@/lib/guild-master';

/**
 * GET /api/discord/guilds/[discordGuildId]/channels
 * Liste der Text-Channels des Servers (für „Lese Channels“).
 * Nur für eingeloggte User, die Gildenmeister dieser Gilde sind.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ discordGuildId: string }> }
) {
  const { discordGuildId } = await params;
  if (!discordGuildId) {
    return NextResponse.json(
      { error: 'Missing discordGuildId' },
      { status: 400 }
    );
  }

  const guild = await prisma.rfGuild.findUnique({
    where: { discordGuildId },
  });
  if (!guild) {
    return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
  }

  const auth = await requireGuildMasterOrForbid(guild.id);
  if (auth instanceof NextResponse) return auth;

  try {
    const channels = await getGuildChannels(discordGuildId);
    return NextResponse.json({
      channels: channels.map((ch) => ({
        id: ch.id,
        name: ch.name,
        type: ch.type,
      })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[API discord channels]', e);
    return NextResponse.json(
      {
        error: 'Failed to fetch channels',
        detail: process.env.NODE_ENV === 'development' ? message : undefined,
      },
      { status: 502 }
    );
  }
}
