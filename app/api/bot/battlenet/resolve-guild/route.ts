import { NextRequest, NextResponse } from 'next/server';
import { verifyBotSecret } from '@/lib/bot-auth';
import {
  autoResolveWowGuild,
  normalizeUserGuildSearchInput,
  searchWowGuildsOnRealm,
  type WowGuildSearchHit,
} from '@/lib/battlenet-guild';
import { loadRfBattlenetRealmRow, realmRowToGuildSearchRealmArg } from '@/lib/battlenet-realm-resolve';

function hitToJson(hit: WowGuildSearchHit) {
  return {
    id: hit.id.toString(),
    name: hit.name,
    realmSlug: hit.realmSlug,
    realmNumericId: hit.realmNumericId != null ? hit.realmNumericId.toString() : null,
  };
}

/**
 * POST /api/bot/battlenet/resolve-guild
 * Discord-Bot (später): Gildenname + Realm-ID → Battle.net-Gilden-ID (Suche oder Auto-Auflösung).
 * Auth: BOT_SETUP_SECRET.
 *
 * Body: { realmId, query, mode?: "search" | "auto" } — mode default "search".
 */
export async function POST(request: NextRequest) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    realmId?: string;
    query?: string;
    guildName?: string;
    mode?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const realmId = typeof body.realmId === 'string' ? body.realmId.trim() : '';
  const qRaw =
    typeof body.query === 'string'
      ? body.query
      : typeof body.guildName === 'string'
        ? body.guildName
        : '';
  const query = normalizeUserGuildSearchInput(qRaw);
  const mode = typeof body.mode === 'string' ? body.mode.trim().toLowerCase() : 'search';

  if (!realmId || !query) {
    return NextResponse.json(
      { error: 'realmId und query (oder guildName) sind erforderlich.' },
      { status: 400 }
    );
  }

  const realm = await loadRfBattlenetRealmRow(realmId);
  if (!realm) {
    return NextResponse.json({ error: 'Realm nicht gefunden.' }, { status: 404 });
  }

  const realmArg = realmRowToGuildSearchRealmArg(realm);

  try {
    if (mode === 'auto') {
      const resolved = await autoResolveWowGuild(realmArg, query);
      if (resolved.status === 'ok') {
        return NextResponse.json({
          ok: true,
          realmId: realm.id,
          status: 'ok',
          guild: hitToJson(resolved.guild),
        });
      }
      if (resolved.status === 'ambiguous') {
        return NextResponse.json({
          ok: true,
          realmId: realm.id,
          status: 'ambiguous',
          guilds: resolved.guilds.map(hitToJson),
        });
      }
      return NextResponse.json({
        ok: true,
        realmId: realm.id,
        status: 'not_found',
        guilds: [] as const,
      });
    }

    if (mode === 'search') {
      const hits = await searchWowGuildsOnRealm(realmArg, query);
      return NextResponse.json({
        ok: true,
        realmId: realm.id,
        results: hits.map(hitToJson),
      });
    }

    return NextResponse.json(
      { error: "mode muss 'search' oder 'auto' sein." },
      { status: 400 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[bot/battlenet/resolve-guild]', e);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
