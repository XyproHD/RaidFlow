import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { getGuildsForUserCached } from '@/lib/user-guilds';

/**
 * GET /api/user/guilds
 * Gilden, in denen der eingeloggte User Mitglied ist (aus DB; Discord aktualisiert der Bot).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
  const discordId = (session as { discordId?: string } | null)?.discordId;

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const guilds = await getGuildsForUserCached(userId, discordId ?? null);
    return NextResponse.json({ guilds });
  } catch (e) {
    console.error('[API user/guilds]', e);
    return NextResponse.json(
      { error: 'Failed to load guilds' },
      { status: 500 }
    );
  }
}
