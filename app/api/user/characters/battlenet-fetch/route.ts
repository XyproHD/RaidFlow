import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import {
  BattlenetCharacterRequestError,
  fetchClassicCharacterFromBattlenetByRealm,
} from '@/lib/battlenet';
import type { WowRegion } from '@/lib/wow-classic-realms';
import { appLocaleToBnetLocale, pickRealmNameFromJson, titleCaseFromSlug } from '@/lib/wow-realm-name';
import { classicFetchResultToJson } from '@/lib/battlenet-character-persist';

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

  try {
    const realm = await prisma.rfBattlenetRealm.findUnique({
      where: { id: realmId },
      select: { region: true, version: true, name: true, slug: true, namespace: true },
    });
    if (!realm) {
      return NextResponse.json({ error: 'Ausgewaehlter Realm wurde nicht gefunden.' }, { status: 400 });
    }

    const bnetLocale = appLocaleToBnetLocale(body.appLocale ?? 'en');
    const realmDisplay =
      pickRealmNameFromJson(realm.name, bnetLocale) || titleCaseFromSlug(realm.slug);

    const fetched = await fetchClassicCharacterFromBattlenetByRealm(
      {
        region: (realm.region as WowRegion | undefined) ?? 'eu',
        namespace: realm.namespace,
        slug: realm.slug,
        version: realm.version,
        name: realmDisplay,
      },
      name
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
