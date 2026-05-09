import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import {
  BattlenetCharacterRequestError,
  fetchClassicCharacterFromBattlenetByRealm,
} from '@/lib/battlenet';
import { classicFetchResultToJson } from '@/lib/battlenet-character-persist';
import { loadRfBattlenetRealmRow, realmRowToBattlenetRealmArg } from '@/lib/battlenet-realm-resolve';
import { getGuildsForUserCached } from '@/lib/user-guilds';

/**
 * POST: Charakter von Battle.net laden (Vorschau für Formular), ohne DB-Schreiben.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    realmId?: string;
    name?: string;
    appLocale?: string;
    /** Optional: zugeordnete Gilde — ermöglicht Fallback über GET …/guild/…/roster wenn direktes Profil 404 */
    guildId?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const realmId = body.realmId?.trim();
  const name = body.name?.trim();
  if (!realmId || !name) {
    return NextResponse.json({ error: 'Realm und Charaktername sind erforderlich.' }, { status: 400 });
  }

  const discordId = (session as { discordId?: string } | null)?.discordId ?? null;

  try {
    const realm = await loadRfBattlenetRealmRow(realmId);
    if (!realm) {
      return NextResponse.json({ error: 'Ausgewaehlter Realm wurde nicht gefunden.' }, { status: 400 });
    }

    let guildRosterFallbackName: string | null = null;
    const rawGuildId = typeof body.guildId === 'string' ? body.guildId.trim() : '';
    if (rawGuildId) {
      const userGuilds = await getGuildsForUserCached(userId, discordId);
      const allowed = new Set(userGuilds.map((g) => g.id));
      if (allowed.has(rawGuildId)) {
        const g = await prisma.rfGuild.findUnique({
          where: { id: rawGuildId },
          select: { battlenetGuildName: true },
        });
        guildRosterFallbackName = g?.battlenetGuildName?.trim() ?? null;
      }
    }

    const fetched = await fetchClassicCharacterFromBattlenetByRealm(
      realmRowToBattlenetRealmArg(realm, body.appLocale),
      name,
      guildRosterFallbackName ? { guildRosterFallbackGuildName: guildRosterFallbackName } : undefined
    );

    const { characterName, mainSpec, profile } = classicFetchResultToJson(fetched);
    return NextResponse.json({ characterName, mainSpec, profile });
  } catch (err) {
    if (err instanceof BattlenetCharacterRequestError) {
      return NextResponse.json(
        {
          error: err.message,
          battlenetDebug: err.battlenetDebug,
          notFound: err.battlenetDebug.httpStatus === 404,
        },
        { status: 400 }
      );
    }
    const message = err instanceof Error ? err.message : 'Battle.net Abfrage fehlgeschlagen';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
