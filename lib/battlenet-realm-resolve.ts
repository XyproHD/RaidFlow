import { prisma } from '@/lib/prisma';
import type { WowRegion } from '@/lib/wow-classic-realms';
import { appLocaleToBnetLocale, pickRealmNameFromJson, titleCaseFromSlug } from '@/lib/wow-realm-name';

/** Zeile aus rf_battlenet_realm für Profile-/Gilden-API (Battle.net). */
export async function loadRfBattlenetRealmRow(realmId: string) {
  const id = realmId.trim();
  if (!id) return null;
  return prisma.rfBattlenetRealm.findUnique({
    where: { id },
    select: { id: true, region: true, version: true, name: true, slug: true, namespace: true },
  });
}

export type RfBattlenetRealmRow = NonNullable<Awaited<ReturnType<typeof loadRfBattlenetRealmRow>>>;

export function realmRowToBattlenetRealmArg(realm: RfBattlenetRealmRow, appLocale?: string) {
  const bnetLocale = appLocaleToBnetLocale(appLocale ?? 'en');
  const realmDisplay =
    pickRealmNameFromJson(realm.name, bnetLocale) || titleCaseFromSlug(realm.slug);
  return {
    region: (realm.region as WowRegion | undefined) ?? 'eu',
    namespace: realm.namespace,
    slug: realm.slug,
    version: realm.version,
    name: realmDisplay,
  };
}

export function realmRowToGuildSearchRealmArg(realm: RfBattlenetRealmRow) {
  return {
    region: (realm.region as WowRegion | undefined) ?? 'eu',
    slug: realm.slug,
    namespace: realm.namespace,
  };
}
