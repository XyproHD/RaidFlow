import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const rows = await prisma.rfBattlenetRealm.findMany({
      select: { region: true, realmSlug: true, realmName: true, wowVersion: true },
      orderBy: [{ region: 'asc' }, { realmName: 'asc' }],
      take: 10000,
    });

    const seen = new Set<string>();
    const realms = [];
    for (const r of rows) {
      const key = `${r.region}:${r.realmSlug}`;
      if (seen.has(key)) continue;
      seen.add(key);
      realms.push({
        region: r.region,
        slug: r.realmSlug,
        name: r.realmName,
        wowVersion: r.wowVersion,
      });
    }

    return NextResponse.json({ realms });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Realm-Liste konnte nicht geladen werden.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
