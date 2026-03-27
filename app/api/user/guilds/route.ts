import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGuildsForUser } from '@/lib/user-guilds';

/**
 * GET /api/user/guilds
 * Gilden, in denen der eingeloggte User Mitglied ist (hat mind. eine RaidFlow-Rolle).
 * Synchronisiert UserGuild/GuildMember (Sync mit Discord/Bot).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session as { userId?: string } | null)?.userId;
  const discordId = (session as { discordId?: string } | null)?.discordId;

  if (!userId || !discordId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const guilds = await getGuildsForUser(userId, discordId);
    return NextResponse.json({ guilds });
  } catch (e) {
    console.error('[API user/guilds]', e);
    return NextResponse.json(
      { error: 'Failed to load guilds' },
      { status: 500 }
    );
  }
}
