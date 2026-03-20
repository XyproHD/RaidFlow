import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { prisma } from '@/lib/prisma';
import {
  appLocaleToBnetLocale,
  pickRealmNameFromJson,
  titleCaseFromSlug,
} from '@/lib/wow-realm-name';

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const appLocale = request.nextUrl.searchParams.get('locale') ?? 'en';
  const bnetLocale = appLocaleToBnetLocale(appLocale);

  try {
    const rows = await prisma.rfBattlenetRealm.findMany({
      select: { id: true, region: true, slug: true, name: true, version: true },
      orderBy: [{ region: 'asc' }, { slug: 'asc' }],
      take: 10000,
    });
    const realms = rows.map((r) => {
      const fromJson = pickRealmNameFromJson(r.name, bnetLocale);
      const displayName = fromJson || titleCaseFromSlug(r.slug);
      return {
        id: r.id,
        region: r.region,
        slug: r.slug,
        name: displayName,
        wowVersion: r.version,
      };
    });

    return NextResponse.json({ realms });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Realm-Liste konnte nicht geladen werden.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
