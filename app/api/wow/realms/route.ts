import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { prisma } from '@/lib/prisma';

function pickRealmName(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';

  const names = value as Record<string, unknown>;
  const preferredLocales = ['de_DE', 'en_US', 'en_GB', 'fr_FR', 'es_ES'];
  for (const locale of preferredLocales) {
    const localized = names[locale];
    if (typeof localized === 'string' && localized.trim().length > 0) {
      return localized;
    }
  }

  for (const localized of Object.values(names)) {
    if (typeof localized === 'string' && localized.trim().length > 0) {
      return localized;
    }
  }
  return '';
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const rows = await prisma.rfBattlenetRealm.findMany({
      select: { id: true, region: true, slug: true, name: true, version: true },
      orderBy: [{ region: 'asc' }, { slug: 'asc' }],
      take: 10000,
    });
    const realms = rows.map((r) => ({
      id: r.id,
      region: r.region,
      slug: r.slug,
      name: pickRealmName(r.name),
      wowVersion: r.version,
    }));

    return NextResponse.json({ realms });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Realm-Liste konnte nicht geladen werden.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
