import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/** Wenn `gear_score` in der DB fehlt (Migration noch nicht angewendet), schlagen normale Prisma-Reads auf `RfCharacter` fehl (P2022). */
export function isMissingGearScoreColumnError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== 'P2022') return false;
  const meta = error.meta;
  const column =
    meta && typeof meta === 'object' && 'column' in meta ? String((meta as { column?: unknown }).column) : '';
  if (column.includes('gear_score')) return true;
  return error.message.includes('gear_score');
}

const dashboardOrderBy: Prisma.RfCharacterOrderByWithRelationInput[] = [
  { guildId: 'asc' },
  { isMain: 'desc' },
  { name: 'asc' },
];

export type DashboardCharacterQueryRow = {
  id: string;
  name: string;
  guildId: string | null;
  mainSpec: string;
  offSpec: string | null;
  isMain: boolean;
  gearScore: number | null;
  guildDiscordDisplayName: string | null;
  guild: { name: string } | null;
  battlenetProfile: { battlenetCharacterId: bigint | null } | null;
};

export async function findManyRfCharactersForDashboard(userId: string): Promise<DashboardCharacterQueryRow[]> {
  const include = {
    guild: { select: { name: true } },
    battlenetProfile: { select: { battlenetCharacterId: true } },
  } as const;
  try {
    const rows = await prisma.rfCharacter.findMany({
      where: { userId },
      include,
      orderBy: dashboardOrderBy,
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      guildId: r.guildId,
      mainSpec: r.mainSpec,
      offSpec: r.offSpec,
      isMain: r.isMain,
      gearScore: r.gearScore ?? null,
      guildDiscordDisplayName: r.guildDiscordDisplayName ?? null,
      guild: r.guild,
      battlenetProfile: r.battlenetProfile,
    }));
  } catch (e) {
    if (!isMissingGearScoreColumnError(e)) throw e;
    const rows = await prisma.rfCharacter.findMany({
      where: { userId },
      select: {
        id: true,
        userId: true,
        guildId: true,
        name: true,
        mainSpec: true,
        offSpec: true,
        isMain: true,
        guildDiscordDisplayName: true,
        createdAt: true,
        updatedAt: true,
        guild: { select: { name: true } },
        battlenetProfile: { select: { battlenetCharacterId: true } },
      },
      orderBy: dashboardOrderBy,
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      guildId: r.guildId,
      mainSpec: r.mainSpec,
      offSpec: r.offSpec,
      isMain: r.isMain,
      gearScore: null,
      guildDiscordDisplayName: r.guildDiscordDisplayName ?? null,
      guild: r.guild,
      battlenetProfile: r.battlenetProfile,
    }));
  }
}

const profileInclude = {
  guild: { select: { id: true, name: true } },
  battlenetProfile: { select: { battlenetCharacterId: true, realmSlug: true } },
} as const;

export type ProfileCharacterQueryRow = Prisma.RfCharacterGetPayload<{ include: typeof profileInclude }> & {
  gearScore?: number | null;
};

export async function findManyRfCharactersForProfile(userId: string): Promise<ProfileCharacterQueryRow[]> {
  try {
    return await prisma.rfCharacter.findMany({
      where: { userId },
      include: profileInclude,
      orderBy: { name: 'asc' },
    });
  } catch (e) {
    if (!isMissingGearScoreColumnError(e)) throw e;
    const rows = await prisma.rfCharacter.findMany({
      where: { userId },
      select: {
        id: true,
        userId: true,
        guildId: true,
        name: true,
        mainSpec: true,
        offSpec: true,
        isMain: true,
        guildDiscordDisplayName: true,
        createdAt: true,
        updatedAt: true,
        guild: { select: { id: true, name: true } },
        battlenetProfile: { select: { battlenetCharacterId: true, realmSlug: true } },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({ ...r, gearScore: null }));
  }
}

type SignupForDashboard = Prisma.RfRaidSignupGetPayload<{
  select: {
    raidId: true;
    type: true;
    signedSpec: true;
    leaderPlacement: true;
    setConfirmed: true;
    character: {
      select: {
        id: true;
        name: true;
        mainSpec: true;
        offSpec: true;
        isMain: true;
        gearScore: true;
        battlenetProfile: { select: { battlenetCharacterId: true } };
      };
    };
    raid: {
      select: {
        id: true;
        name: true;
        guildId: true;
        dungeonId: true;
        scheduledAt: true;
        status: true;
        guild: { select: { name: true } };
        dungeon: { select: { name: true } };
        dungeonIds: true;
      };
    };
  };
}>;

/** Einzelner Charakter wie nach POST/PATCH (Profil-DTO), inkl. Fallback ohne `gear_score`. */
export async function findUniqueRfCharacterForProfileDto(characterId: string) {
  try {
    return await prisma.rfCharacter.findUniqueOrThrow({
      where: { id: characterId },
      include: profileInclude,
    });
  } catch (e) {
    if (!isMissingGearScoreColumnError(e)) throw e;
    const r = await prisma.rfCharacter.findUniqueOrThrow({
      where: { id: characterId },
      select: {
        id: true,
        userId: true,
        guildId: true,
        name: true,
        mainSpec: true,
        offSpec: true,
        isMain: true,
        guildDiscordDisplayName: true,
        createdAt: true,
        updatedAt: true,
        guild: { select: { id: true, name: true } },
        battlenetProfile: { select: { battlenetCharacterId: true, realmSlug: true } },
      },
    });
    return { ...r, gearScore: null };
  }
}

export async function findManyRaidSignupsForDashboard(
  userId: string,
  now: Date,
  rangeEnd: Date
): Promise<SignupForDashboard[]> {
  const selectWithGs = {
    raidId: true,
    type: true,
    signedSpec: true,
    leaderPlacement: true,
    setConfirmed: true,
    character: {
      select: {
        id: true,
        name: true,
        mainSpec: true,
        offSpec: true,
        isMain: true,
        gearScore: true,
        battlenetProfile: { select: { battlenetCharacterId: true } },
      },
    },
    raid: {
      select: {
        id: true,
        name: true,
        guildId: true,
        dungeonId: true,
        scheduledAt: true,
        status: true,
        guild: { select: { name: true } },
        dungeon: { select: { name: true } },
        dungeonIds: true,
      },
    },
  } satisfies Prisma.RfRaidSignupSelect;

  const selectNoGs = {
    raidId: true,
    type: true,
    signedSpec: true,
    leaderPlacement: true,
    setConfirmed: true,
    character: {
      select: {
        id: true,
        name: true,
        mainSpec: true,
        offSpec: true,
        isMain: true,
        battlenetProfile: { select: { battlenetCharacterId: true } },
      },
    },
    raid: {
      select: {
        id: true,
        name: true,
        guildId: true,
        dungeonId: true,
        scheduledAt: true,
        status: true,
        guild: { select: { name: true } },
        dungeon: { select: { name: true } },
        dungeonIds: true,
      },
    },
  } satisfies Prisma.RfRaidSignupSelect;

  const where = {
    userId,
    raid: { scheduledAt: { gte: now, lte: rangeEnd } },
  };
  const orderBy = { raid: { scheduledAt: 'asc' as const } };

  try {
    return await prisma.rfRaidSignup.findMany({
      where,
      select: selectWithGs,
      orderBy,
    });
  } catch (e) {
    if (!isMissingGearScoreColumnError(e)) throw e;
    const rows = await prisma.rfRaidSignup.findMany({
      where,
      select: selectNoGs,
      orderBy,
    });
    return rows.map((r) => ({
      ...r,
      character: r.character
        ? {
            ...r.character,
            gearScore: null as number | null,
          }
        : r.character,
    })) as SignupForDashboard[];
  }
}
