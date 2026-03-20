import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { fetchClassicRealmsFromBattlenet } from '@/lib/battlenet';
import type { WowRegion, WowVersion } from '@/lib/wow-classic-realms';

function parseRegion(v: string | null): WowRegion {
  if (v === 'us' || v === 'kr' || v === 'tw' || v === 'eu') return v;
  return 'eu';
}

function parseVersion(v: string | null): WowVersion | null {
  if (!v || v === 'all') return null;
  if (
    v === 'progression' ||
    v === 'classic_era' ||
    v === 'hardcore' ||
    v === 'season_of_discovery' ||
    v === 'anniversary'
  ) {
    return v;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const region = parseRegion(url.searchParams.get('region'));
  const wowVersion = parseVersion(url.searchParams.get('wowVersion'));

  try {
    const realms = await fetchClassicRealmsFromBattlenet(region, wowVersion);
    return NextResponse.json({ realms });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Realm-Liste konnte nicht geladen werden.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
