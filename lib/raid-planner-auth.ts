/**
 * Zugriff auf den Raidplaner (Neuer Raid): RaidFlow-Raidleader oder Gildenmeister.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { getEffectiveWebUserGuildRole } from '@/lib/owner-web-permission-override';

export interface RaidPlannerAuthResult {
  userId: string;
  guildId: string;
}

export async function requireRaidPlannerForGuild(
  guildId: string
): Promise<RaidPlannerAuthResult | null> {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(
    session as { userId?: string; discordId?: string } | null
  );
  if (!userId) return null;

  const effective = await getEffectiveWebUserGuildRole(userId, guildId);
  if (!effective) return null;
  if (effective !== 'raidleader' && effective !== 'guildmaster') return null;

  return { userId, guildId };
}

export async function requireRaidPlannerOrForbid(
  guildId: string
): Promise<RaidPlannerAuthResult | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.discordId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await requireRaidPlannerForGuild(guildId);
  if (!result) {
    return NextResponse.json(
      { error: 'Forbidden: Raid leader or guild master required' },
      { status: 403 }
    );
  }
  return result;
}
