import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { syncDiscordUserGuildMemberships } from '@/lib/sync-user-guild-memberships';
import { getGuildsForUser } from '@/lib/user-guilds';

/**
 * POST /api/user/sync-guild-membership
 * Prüft Discord-Rollen und schreibt rf_user_guild (alle registrierten Gilden).
 */
export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
  const discordId = (session as { discordId?: string } | null)?.discordId?.trim() ?? '';

  if (!userId || !discordId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sync = await syncDiscordUserGuildMemberships({ discordUserId: discordId, userId });
    const guilds = await getGuildsForUser(userId, discordId);
    return NextResponse.json({
      ok: true,
      syncedGuildIds: sync.syncedGuildIds,
      anyMembershipKnown: sync.anyMembershipKnown,
      guilds,
    });
  } catch (e) {
    console.error('[API user/sync-guild-membership]', e);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}
