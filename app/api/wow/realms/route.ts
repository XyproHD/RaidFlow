import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { prisma } from '@/lib/prisma';
import type { WowPreset, WowRegion } from '@/lib/wow-classic-realms';
import { WOW_PRESET_TO_INTERNAL_WOW_VERSIONS } from '@/lib/wow-classic-realms';

function parseRegion(v: string | null): WowRegion {
  if (v === 'us' || v === 'kr' || v === 'tw' || v === 'eu') return v;
  return 'eu';
}

function parsePreset(v: string | null): WowPreset | null {
  if (!v) return null;
  if (v === 'retail' || v === 'classic' || v === 'tbc' || v === 'mop') return v;
  return null;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const region = parseRegion(url.searchParams.get('region'));
  const wowPreset = parsePreset(url.searchParams.get('wowVersion')) ?? 'classic';

  try {
    const internalWowVersions = WOW_PRESET_TO_INTERNAL_WOW_VERSIONS[wowPreset];

    if (!internalWowVersions.length) {
      return NextResponse.json({ realms: [] });
    }

    const rows = await prisma.rfBattlenetRealm.findMany({
      where: {
        region,
        wowVersion: { in: internalWowVersions },
      },
      select: { region: true, realmSlug: true, realmName: true },
      orderBy: { realmName: 'asc' },
      take: 10000,
    });

    const seen = new Set<string>();
    const realms = [];
    for (const r of rows) {
      if (seen.has(r.realmSlug)) continue;
      seen.add(r.realmSlug);
      realms.push({
        region: r.region as WowRegion,
        slug: r.realmSlug,
        name: r.realmName,
      });
    }

    return NextResponse.json({ realms });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Realm-Liste konnte nicht geladen werden.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
