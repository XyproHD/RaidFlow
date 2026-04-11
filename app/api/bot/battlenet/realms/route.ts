/**
 * WoW-Server (Realms) für den Discord-Bot: optional nach Version gefiltert, optional Suchtext.
 * Auth: BOT_SETUP_SECRET.
 *
 * Ohne `version`: wie bisher bis zu 25 Treffer über Slug-Teilstring `q`.
 * Mit `version` und ohne `q`: wenn mehr als 25 Server in dieser Version → `truncated: true`, `realms: []`.
 * Mit `version` und `q`: bis zu 25 Treffer (Slug + Anzeigename, in-memory).
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
const DB_SLUG_CAP = 160;
const SCAN_CAP_PER_VERSION = 2500;

export async function GET(request: NextRequest) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const version = request.nextUrl.searchParams.get('version')?.trim() ?? '';
  const qRaw = request.nextUrl.searchParams.get('q')?.trim() ?? '';
  const q = qRaw.toLowerCase();
  const appLocale = request.nextUrl.searchParams.get('locale') ?? 'de';
  const bnetLocale = appLocaleToBnetLocale(appLocale);

  try {
    if (version && !qRaw) {
      const total = await prisma.rfBattlenetRealm.count({ where: { version } });
      if (total > MAX_RETURN) {
        return NextResponse.json({
          realms: [],
          total,
          truncated: true,
        });
      }
      const rows = await prisma.rfBattlenetRealm.findMany({
        where: { version },
        select: { id: true, region: true, slug: true, name: true, version: true },
        orderBy: [{ region: 'asc' }, { slug: 'asc' }],
        take: MAX_RETURN,
      });
      const realms = mapRows(rows, bnetLocale);
      return NextResponse.json({ realms, total, truncated: false });
    }

    if (version && qRaw) {
      const rows = await prisma.rfBattlenetRealm.findMany({
        where: {
          version,
          slug: { contains: qRaw, mode: 'insensitive' },
        },
        select: { id: true, region: true, slug: true, name: true, version: true },
        orderBy: [{ region: 'asc' }, { slug: 'asc' }],
        take: DB_SLUG_CAP,
      });
      const mapped = mapRows(rows, bnetLocale);
      const finer = mapped.filter((r) => {
        const hay = `${r.label} ${r.slug} ${r.region} ${r.name}`.toLowerCase();
        return hay.includes(q);
      });
      const pool = finer.length > 0 ? finer : mapped;
      const total = pool.length;
      return NextResponse.json({
        realms: pool.slice(0, MAX_RETURN),
        total,
        truncated: total > MAX_RETURN,
      });
    }

    const rows = await prisma.rfBattlenetRealm.findMany({
      where:
        q.length > 0
          ? {
              slug: { contains: qRaw, mode: 'insensitive' },
            }
          : undefined,
      select: { id: true, region: true, slug: true, name: true, version: true },
      orderBy: [{ region: 'asc' }, { slug: 'asc' }],
      take: q.length > 0 ? DB_SLUG_CAP : MAX_RETURN,
    });

    const mapped = mapRows(rows, bnetLocale);

    let out = mapped;
    if (q.length > 0) {
      const finer = mapped.filter((r) => {
        const hay = `${r.label} ${r.slug} ${r.region} ${r.name}`.toLowerCase();
        return hay.includes(q);
      });
      out = finer.length > 0 ? finer : mapped;
    }

    return NextResponse.json({ realms: out.slice(0, MAX_RETURN), total: out.length, truncated: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[bot/battlenet/realms]', e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function mapRows(
  rows: { id: string; region: string; slug: string; name: unknown; version: string }[],
  bnetLocale: string
) {
  return rows.map((r) => {
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
}
