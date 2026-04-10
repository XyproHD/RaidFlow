import { NextRequest, NextResponse } from 'next/server';
import {
  BattlenetCharacterRequestError,
  fetchClassicCharacterFromBattlenetByRealm,
} from '@/lib/battlenet';
import { verifyBotSecret } from '@/lib/bot-auth';
import { classicFetchResultToJson } from '@/lib/battlenet-character-persist';
import { loadRfBattlenetRealmRow, realmRowToBattlenetRealmArg } from '@/lib/battlenet-realm-resolve';

/**
 * POST /api/bot/battlenet/resolve-character
 * Discord-Bot (später): Charaktername + Realm-ID → Battle.net-Profil inkl. battlenetCharacterId (JSON-safe).
 * Auth: BOT_SETUP_SECRET.
 *
 * Body: { realmId, characterName, appLocale?, includeRawProfile? }
 */
export async function POST(request: NextRequest) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    realmId?: string;
    characterName?: string;
    name?: string;
    appLocale?: string;
    includeRawProfile?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const realmId = typeof body.realmId === 'string' ? body.realmId.trim() : '';
  const rawName = typeof body.characterName === 'string' ? body.characterName : body.name;
  const characterName = typeof rawName === 'string' ? rawName.trim() : '';
  if (!realmId || !characterName) {
    return NextResponse.json(
      { error: 'realmId und characterName (oder name) sind erforderlich.' },
      { status: 400 }
    );
  }

  const includeRawProfile = body.includeRawProfile === true;

  try {
    const realm = await loadRfBattlenetRealmRow(realmId);
    if (!realm) {
      return NextResponse.json({ error: 'Realm nicht gefunden.' }, { status: 404 });
    }

    const fetched = await fetchClassicCharacterFromBattlenetByRealm(
      realmRowToBattlenetRealmArg(realm, body.appLocale),
      characterName
    );

    const { characterName: resolvedName, mainSpec, profile } = classicFetchResultToJson(fetched);
    const profileOut = { ...profile };
    if (!includeRawProfile) {
      delete profileOut.rawProfile;
    }

    return NextResponse.json({
      ok: true,
      realmId: realm.id,
      characterName: resolvedName,
      mainSpec,
      profile: profileOut,
    });
  } catch (err) {
    if (err instanceof BattlenetCharacterRequestError) {
      return NextResponse.json(
        {
          ok: false,
          error: err.message,
          battlenetDebug: err.battlenetDebug,
          notFound: err.battlenetDebug.httpStatus === 404,
        },
        { status: err.battlenetDebug.httpStatus === 404 ? 404 : 502 }
      );
    }
    const message = err instanceof Error ? err.message : 'Battle.net Abfrage fehlgeschlagen';
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
