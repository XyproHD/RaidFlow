import { prisma } from '@/lib/prisma';
import {
  getGuildsForUser,
  userGuildCanEditRaids,
  userGuildCanSeeRaid,
  type UserGuildInfo,
} from '@/lib/user-guilds';
import {
  computeRaidSignupPhase,
  type RaidPageMode,
  type RaidSignupPhase,
} from '@/lib/raid-detail-shared';

export type { RaidPageMode, RaidSignupPhase };
export { computeRaidSignupPhase, parseRaidPageMode } from '@/lib/raid-detail-shared';
export { filterSignupsVisibleToViewer } from '@/lib/raid-detail-shared';

export type RaidDetailAccessReason =
  | 'guild_not_found'
  | 'raid_not_found'
  | 'raid_access_denied';

async function loadRaidForDetailPage(
  guildId: string,
  raidId: string,
  locale: string
) {
  return prisma.rfRaid.findFirst({
    where: { id: raidId, guildId },
    include: {
      guild: { select: { name: true } },
      dungeon: {
        select: {
          id: true,
          name: true,
          names: { where: { locale }, take: 1, select: { name: true } },
        },
      },
      raidGroupRestriction: { select: { id: true, name: true } },
      signups: {
        include: {
          character: {
            select: {
              id: true,
              name: true,
              mainSpec: true,
              offSpec: true,
              gearScore: true,
              isMain: true,
              guildDiscordDisplayName: true,
            },
          },
        },
        orderBy: { signedAt: 'asc' },
      },
      _count: { select: { signups: true } },
    },
  });
}

/** Berechtigung ohne Lokalisierung (API + Seite). */
export async function resolveRaidAccess(
  userId: string,
  discordId: string,
  guildId: string,
  raidId: string
): Promise<
  | { ok: false; reason: RaidDetailAccessReason }
  | {
      ok: true;
      guildInfo: UserGuildInfo;
      canEdit: boolean;
      /** true solange Raid offen und Anmeldung (inkl. nur-Reserve-Phase) möglich */
      canSignup: boolean;
      signupPhase: RaidSignupPhase;
    }
> {
  const guilds = await getGuildsForUser(userId, discordId);
  const guildInfo = guilds.find((g) => g.id === guildId);
  if (!guildInfo) {
    return { ok: false, reason: 'guild_not_found' };
  }

  const raid = await prisma.rfRaid.findFirst({
    where: { id: raidId, guildId },
    select: {
      id: true,
      guildId: true,
      raidGroupRestrictionId: true,
      status: true,
      signupUntil: true,
    },
  });
  if (!raid) {
    return { ok: false, reason: 'raid_not_found' };
  }
  if (!userGuildCanSeeRaid(guildInfo, raid)) {
    return { ok: false, reason: 'raid_access_denied' };
  }

  const canEdit = userGuildCanEditRaids(guildInfo);
  const signupPhase = computeRaidSignupPhase(raid);
  const canSignup = signupPhase !== 'closed';

  return { ok: true, guildInfo, canEdit, canSignup, signupPhase };
}

export async function getRaidDetailContext(
  userId: string,
  discordId: string,
  guildId: string,
  raidId: string,
  locale: string
): Promise<
  | { ok: false; reason: RaidDetailAccessReason }
  | {
      ok: true;
      guildInfo: UserGuildInfo;
      canEdit: boolean;
      canSignup: boolean;
      signupPhase: RaidSignupPhase;
      raid: (NonNullable<Awaited<ReturnType<typeof loadRaidForDetailPage>>> & { dungeonNames: string[] });
    }
> {
  const access = await resolveRaidAccess(userId, discordId, guildId, raidId);
  if (!access.ok) return access;

  const raid = await loadRaidForDetailPage(guildId, raidId, locale);
  if (!raid) {
    return { ok: false, reason: 'raid_not_found' };
  }

  const rawIds = (raid as unknown as { dungeonIds?: unknown }).dungeonIds;
  const dungeonIds =
    Array.isArray(rawIds) && rawIds.every((x) => typeof x === 'string')
      ? (rawIds as string[]).map((x) => x.trim()).filter(Boolean)
      : [];
  const ids = Array.from(new Set([raid.dungeonId, ...dungeonIds].filter(Boolean)));

  const nameRows = ids.length
    ? await prisma.rfDungeonName.findMany({
        where: { dungeonId: { in: ids }, locale },
        select: { dungeonId: true, name: true },
      })
    : [];
  const nameById = new Map(nameRows.map((r) => [r.dungeonId, r.name]));

  const fallbackRows = ids.length
    ? await prisma.rfDungeon.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      })
    : [];
  const fallbackById = new Map(fallbackRows.map((r) => [r.id, r.name]));

  const dungeonNames = ids
    .map((id) => nameById.get(id) ?? fallbackById.get(id) ?? id)
    .filter(Boolean);

  return {
    ok: true,
    guildInfo: access.guildInfo,
    canEdit: access.canEdit,
    canSignup: access.canSignup,
    signupPhase: access.signupPhase,
    raid: { ...raid, dungeonNames },
  };
}
