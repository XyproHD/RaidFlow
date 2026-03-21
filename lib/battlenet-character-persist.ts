import type { Prisma } from '@prisma/client';

/** JSON-safe payload from client after a successful Battle.net preview sync */
export type BattlenetProfileJson = {
  configId: string;
  region: string;
  wowVersion?: string | null;
  realmSlug: string;
  realmName?: string | null;
  characterNameLower: string;
  battlenetCharacterId?: string | null;
  level?: number | null;
  raceName?: string | null;
  className?: string | null;
  activeSpecName?: string | null;
  guildName?: string | null;
  faction?: string | null;
  profileUrl?: string | null;
  rawProfile?: Prisma.InputJsonValue | null;
};

export function battlenetProfileJsonToUpsertData(
  p: BattlenetProfileJson
): Omit<Prisma.RfBattlenetCharacterProfileUncheckedCreateInput, 'characterId'> {
  return {
    battlenetConfigId: p.configId || null,
    region: p.region,
    wowVersion: p.wowVersion ?? null,
    realmSlug: p.realmSlug,
    realmName: p.realmName ?? null,
    characterNameLower: p.characterNameLower,
    battlenetCharacterId: p.battlenetCharacterId ? BigInt(p.battlenetCharacterId) : null,
    level: p.level ?? null,
    raceName: p.raceName ?? null,
    className: p.className ?? null,
    activeSpecName: p.activeSpecName ?? null,
    guildName: p.guildName ?? null,
    faction: p.faction ?? null,
    profileUrl: p.profileUrl ?? null,
    rawProfile: p.rawProfile === undefined ? undefined : (p.rawProfile as Prisma.InputJsonValue),
    lastSyncedAt: new Date(),
  };
}

export function classicFetchResultToJson(
  profile: {
    configId: string;
    region: string;
    wowVersion: string | null;
    realmSlug: string;
    realmName: string | null;
    characterName: string;
    characterNameLower: string;
    battlenetCharacterId: bigint | null;
    level: number | null;
    raceName: string | null;
    className: string | null;
    activeSpecName: string | null;
    guildName: string | null;
    faction: string | null;
    profileUrl: string;
    rawProfile: unknown;
    mainSpec: string;
  }
): { characterName: string; mainSpec: string; profile: BattlenetProfileJson } {
  return {
    characterName: profile.characterName,
    mainSpec: profile.mainSpec,
    profile: {
      configId: profile.configId,
      region: profile.region,
      wowVersion: profile.wowVersion,
      realmSlug: profile.realmSlug,
      realmName: profile.realmName,
      characterNameLower: profile.characterNameLower,
      battlenetCharacterId: profile.battlenetCharacterId?.toString() ?? null,
      level: profile.level,
      raceName: profile.raceName,
      className: profile.className,
      activeSpecName: profile.activeSpecName,
      guildName: profile.guildName,
      faction: profile.faction,
      profileUrl: profile.profileUrl,
      rawProfile: profile.rawProfile as Prisma.InputJsonValue,
    },
  };
}

export function isBattlenetProfileJson(x: unknown): x is BattlenetProfileJson {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.configId === 'string' &&
    o.configId.length > 0 &&
    typeof o.region === 'string' &&
    o.region.length > 0 &&
    typeof o.realmSlug === 'string' &&
    o.realmSlug.length > 0 &&
    typeof o.characterNameLower === 'string' &&
    o.characterNameLower.length > 0
  );
}
