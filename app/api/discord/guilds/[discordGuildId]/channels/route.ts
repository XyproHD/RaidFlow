import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { prisma } from '@/lib/prisma';
import { getGuildChannels } from '@/lib/discord-guild-api';

/**
 * GET /api/discord/guilds/[discordGuildId]/channels
 * Liste der Text-Channels des Servers (für „Lese Channels“).
 * Nur für eingeloggte User, die Gildenmeister dieser Gilde sind.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ discordGuildId: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(
    session as { userId?: string; discordId?: string } | null
  );
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

  const ug = await prisma.rfUserGuild.findUnique({
    where: {
      userId_guildId: { userId, guildId: guild.id },
    },
  });
  if (!ug || ug.role !== 'guildmaster') {
    return NextResponse.json(
      { error: 'Forbidden: Guild master required' },
      { status: 403 }
    );
  }

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
