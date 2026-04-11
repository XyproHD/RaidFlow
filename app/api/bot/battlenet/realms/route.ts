/**
 * Realm-Vorschläge für den Discord-Bot (Suchfeld → Auswahlmenü).
 * Auth: BOT_SETUP_SECRET.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyBotSecret } from '@/lib/bot-auth';
import { prisma } from '@/lib/prisma';
import {
  appLocaleToBnetLocale,
  pickRealmNameFromJson,
  titleCaseFromSlug,
} from '@/lib/wow-realm-name';

const MAX_RETURN = 25;
/** Slug-Teilstring in der DB; danach optional Feintuning über Anzeigenamen (Locale). */
const DB_MATCH_CAP = 120;

export async function GET(request: NextRequest) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const qRaw = (request.nextUrl.searchParams.get('q') ?? '').trim();
  const q = qRaw.toLowerCase();
  const appLocale = request.nextUrl.searchParams.get('locale') ?? 'de';
  const bnetLocale = appLocaleToBnetLocale(appLocale);

  try {
    const rows = await prisma.rfBattlenetRealm.findMany({
      where:
        q.length > 0
          ? {
              slug: { contains: qRaw, mode: 'insensitive' },
            }
          : undefined,
      select: { id: true, region: true, slug: true, name: true, version: true },
      orderBy: [{ region: 'asc' }, { slug: 'asc' }],
      take: q.length > 0 ? DB_MATCH_CAP : MAX_RETURN,
    });

    const mapped = rows.map((r) => {
      const fromJson = pickRealmNameFromJson(r.name, bnetLocale);
      const displayName = fromJson || titleCaseFromSlug(r.slug);
      const label = r.version ? `${displayName} (${r.version})` : displayName;
      return {
        id: r.id,
        region: r.region,
        slug: r.slug,
        name: displayName,
        wowVersion: r.version,
        label: `${label} (${r.region})`,
      };
    });

    let out = mapped;
    if (q.length > 0) {
      const finer = mapped.filter((r) => {
        const hay = `${r.label} ${r.slug} ${r.region} ${r.name}`.toLowerCase();
        return hay.includes(q);
      });
      out = finer.length > 0 ? finer : mapped;
    }

    return NextResponse.json({ realms: out.slice(0, MAX_RETURN) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[bot/battlenet/realms]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
