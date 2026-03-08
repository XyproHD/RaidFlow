import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

/**
 * GET /api/discord/guilds/[discordGuildId]/my-roles
 * Gibt die Discord-Rollen-IDs des eingeloggten Users auf dem angegebenen Server zurück.
 * Verwendet den Bot-Token (DISCORD_BOT_TOKEN); nur für eingeloggte User.
 * Für Rechteprüfung (RaidFlow-Gildenmeister, Raidleader, Raider, Raidflowgroup-*).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ discordGuildId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.discordId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { discordGuildId } = await params;
  if (!discordGuildId) {
    return NextResponse.json({ error: 'Missing discordGuildId' }, { status: 400 });
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: 'Bot not configured' }, { status: 503 });
  }

  const res = await fetch(
    `${DISCORD_API_BASE}/guilds/${discordGuildId}/members/${session.discordId}`,
    {
      headers: { Authorization: `Bot ${botToken}` },
    }
  );

  if (res.status === 404) {
    return NextResponse.json({ roleIds: [] });
  }
  if (!res.ok) {
    const text = await res.text();
    console.error('[discord my-roles]', res.status, text);
    return NextResponse.json({ error: 'Discord API error' }, { status: 502 });
  }

  const data = (await res.json()) as { roles?: string[] };
  return NextResponse.json({ roleIds: data.roles ?? [] });
}
