/**
 * Gast-Raid-Zugriff: Discord-Mitglied ohne Raider/Raidleader/Gildenleiter-Rolle.
 * Kein rf_guild_member — Erkennung über Discord + optional rf_user_guild.
 */

import { prisma } from '@/lib/prisma';
import {
  resolveRaidFlowRole,
  type RfGuildWithRoles,
} from '@/lib/discord-roles';
import { userHasRaidflowParticipationInGuild } from '@/lib/guild-permissions-db';
import { resolveDiscordGuildMembership } from '@/lib/resolve-discord-guild-membership';
import {
  computeRaidSignupPhase,
  type RaidSignupPhase,
} from '@/lib/raid-detail-shared';
import {
  getGuildsForUser,
  userGuildCanSeeRaid,
  userGuildCanEditRaids,
  type UserGuildInfo,
  type UserRaidInfo,
  type RaidQueryWindow,
} from '@/lib/user-guilds';

async function resolveDiscordDisplayNameForGuest(
  guildId: string,
  discordId: string,
  displayNameInGuild?: string | null
): Promise<string | null> {
  const direct = displayNameInGuild?.trim();
  if (direct) return direct;

  const guild = await prisma.rfGuild.findUnique({
    where: { id: guildId },
    select: { discordGuildId: true },
  });
  if (!guild) return null;

  const membership = await resolveDiscordGuildMembership(
    guild.discordGuildId,
    discordId
  );
  return membership.displayNameInGuild?.trim() || null;
}

export type RaidAccessMode = 'member' | 'guest';

export type GuestEligibility = {
  eligible: boolean;
  membershipKnown: boolean;
  displayNameInGuild: string | null;
};

export function raidAllowsGuestAccess(raid: {
  allowGuests: boolean;
  raidGroupRestrictionId: string | null;
}): boolean {
  return raid.allowGuests && !raid.raidGroupRestrictionId;
}

export async function loadGuildRoleShape(guildId: string): Promise<
  | (RfGuildWithRoles & { id: string; discordGuildId: string; name: string })
  | null
> {
  return prisma.rfGuild.findUnique({
    where: { id: guildId },
    select: {
      id: true,
      name: true,
      discordGuildId: true,
      discordRoleGuildmasterId: true,
      discordRoleRaidleaderId: true,
      discordRoleRaiderId: true,
      raidGroups: { select: { id: true, discordRoleId: true } },
    },
  });
}

/** User hat Raider-Rechte in DB (rf_user_guild mit raider+). */
export async function userHasMemberRaidAccess(
  userId: string,
  guildId: string
): Promise<boolean> {
  return userHasRaidflowParticipationInGuild(userId, guildId);
}

/**
 * Gast = auf Discord-Server, aber ohne konfigurierte RaidFlow-Rolle (Raider/RL/GM).
 * Nutzer mit rf_user_guild raider+ gelten nicht als Gast.
 */
export async function resolveGuestEligibility(
  userId: string,
  discordId: string,
  guildId: string
): Promise<GuestEligibility> {
  const hasMember = await userHasMemberRaidAccess(userId, guildId);
  if (hasMember) {
    return { eligible: false, membershipKnown: true, displayNameInGuild: null };
  }

  const guild = await loadGuildRoleShape(guildId);
  if (!guild) {
    return { eligible: false, membershipKnown: false, displayNameInGuild: null };
  }

  const membership = await resolveDiscordGuildMembership(
    guild.discordGuildId,
    discordId
  );
  if (!membership.membershipKnown) {
    return {
      eligible: false,
      membershipKnown: false,
      displayNameInGuild: null,
    };
  }
  if (!membership.inGuild) {
    return {
      eligible: false,
      membershipKnown: true,
      displayNameInGuild: null,
    };
  }

  const resolved = resolveRaidFlowRole(guild, membership.roleIds);
  if (resolved) {
    return {
      eligible: false,
      membershipKnown: true,
      displayNameInGuild: membership.displayNameInGuild,
    };
  }

  return {
    eligible: true,
    membershipKnown: true,
    displayNameInGuild: membership.displayNameInGuild,
  };
}

export async function resolveIsGuestSignup(
  userId: string,
  discordId: string,
  guildId: string
): Promise<boolean> {
  const member = await userHasMemberRaidAccess(userId, guildId);
  if (member) return false;
  const guest = await resolveGuestEligibility(userId, discordId, guildId);
  return guest.eligible;
}

/** Minimales UserGuildInfo für Gast-Zugriff (ohne rf_user_guild). */
export async function buildGuestViewerGuildInfo(
  guildId: string
): Promise<UserGuildInfo | null> {
  const guild = await prisma.rfGuild.findUnique({
    where: { id: guildId },
    select: {
      id: true,
      name: true,
      discordGuildId: true,
      battlenetRealmId: true,
      battlenetGuildId: true,
      battlenetProfileRealmSlug: true,
      battlenetGuildName: true,
      battlenetRealm: { select: { slug: true, region: true, version: true } },
    },
  });
  if (!guild) return null;
  return {
    id: guild.id,
    name: guild.name,
    discordGuildId: guild.discordGuildId,
    role: 'member',
    raidGroupIds: [],
    battlenetRealmId: guild.battlenetRealmId,
    battlenetGuildId: guild.battlenetGuildId?.toString() ?? null,
    battlenetProfileRealmSlug: guild.battlenetProfileRealmSlug,
    battlenetGuildName: guild.battlenetGuildName,
    battlenetRealm: guild.battlenetRealm
      ? {
          slug: guild.battlenetRealm.slug,
          region: guild.battlenetRealm.region,
          version: guild.battlenetRealm.version,
        }
      : null,
  };
}

export async function assignCharacterForGuestSignup(params: {
  userId: string;
  characterId: string;
  guildId: string;
  discordId: string;
  displayNameInGuild?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { userId, characterId, guildId, discordId, displayNameInGuild } = params;

  const character = await prisma.rfCharacter.findFirst({
    where: {
      id: characterId,
      userId,
      OR: [{ guildId: null }, { guildId }],
    },
    select: { id: true, guildId: true, guildDiscordDisplayName: true },
  });
  if (!character) {
    return {
      ok: false,
      error: 'Character not found or already assigned to another guild',
      status: 404,
    };
  }

  const discordDisplayName = await resolveDiscordDisplayNameForGuest(
    guildId,
    discordId,
    displayNameInGuild
  );

  const needsGuildAssign = character.guildId !== guildId;
  const needsDiscordName =
    !!discordDisplayName && !character.guildDiscordDisplayName?.trim();

  if (!needsGuildAssign && !needsDiscordName) {
    return { ok: true };
  }

  const hasMainInGuild = needsGuildAssign
    ? await prisma.rfCharacter.findFirst({
        where: { userId, guildId, isMain: true },
        select: { id: true },
      })
    : null;

  await prisma.rfCharacter.update({
    where: { id: characterId },
    data: {
      ...(needsGuildAssign
        ? {
            guildId,
            isMain: hasMainInGuild ? false : true,
          }
        : {}),
      ...(needsDiscordName ? { guildDiscordDisplayName: discordDisplayName } : {}),
    },
  });

  return { ok: true };
}

/** Korrigiert fehlende is_guest-Flags und Discord-Namen bei Gast-Anmeldungen. */
export async function healGuestSignupMetadataForRaid(
  raidId: string,
  guildId: string
): Promise<void> {
  const rows = await prisma.rfRaidSignup.findMany({
    where: { raidId, isGuest: false },
    select: {
      id: true,
      userId: true,
      user: { select: { discordId: true } },
    },
  });
  for (const row of rows) {
    const guest = await resolveIsGuestSignup(row.userId, row.user.discordId, guildId);
    if (guest) {
      await prisma.rfRaidSignup.update({
        where: { id: row.id },
        data: { isGuest: true },
      });
    }
  }

  const guestSignups = await prisma.rfRaidSignup.findMany({
    where: { raidId, isGuest: true },
    select: {
      userId: true,
      characterId: true,
      character: { select: { id: true, guildDiscordDisplayName: true } },
      user: { select: { discordId: true } },
    },
  });

  for (const signup of guestSignups) {
    if (!signup.characterId || signup.character?.guildDiscordDisplayName?.trim()) continue;
    await assignCharacterForGuestSignup({
      userId: signup.userId,
      characterId: signup.characterId,
      guildId,
      discordId: signup.user.discordId,
    });
  }
}

/**
 * Gast-Raids fürs Dashboard: allowGuests, keine Gruppen-Restriction, Anmeldung offen,
 * User Discord-Gast der Gilde, noch nicht über Raider-Pfad sichtbar.
 */
export async function getGuestRaidsForDashboard(
  userId: string,
  discordId: string,
  memberGuildIdsWithRaidAccess: Set<string>,
  window: RaidQueryWindow = {}
): Promise<UserRaidInfo[]> {
  const { from, to } = window;
  const scheduledAtFilter =
    from || to
      ? {
          scheduledAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {};

  const candidateRaids = await prisma.rfRaid.findMany({
    where: {
      allowGuests: true,
      raidGroupRestrictionId: null,
      status: { in: ['open', 'announced'] },
      ...scheduledAtFilter,
    },
    include: {
      guild: { select: { id: true, name: true, discordGuildId: true } },
      dungeon: { select: { name: true } },
      _count: { select: { signups: true } },
    },
    orderBy: { scheduledAt: 'asc' },
  });

  const openGuestRaids = candidateRaids.filter(
    (r) => computeRaidSignupPhase(r) !== 'closed'
  );

  const guildIdsNeeded = [
    ...new Set(
      openGuestRaids
        .map((r) => r.guildId)
        .filter((id) => !memberGuildIdsWithRaidAccess.has(id))
    ),
  ];

  const guestEligibleByGuild = new Map<string, boolean>();
  for (const gid of guildIdsNeeded) {
    const g = await resolveGuestEligibility(userId, discordId, gid);
    guestEligibleByGuild.set(gid, g.eligible);
  }

  const result: UserRaidInfo[] = [];
  for (const raid of openGuestRaids) {
    if (memberGuildIdsWithRaidAccess.has(raid.guildId)) continue;
    if (!guestEligibleByGuild.get(raid.guildId)) continue;

    result.push({
      id: raid.id,
      guildId: raid.guildId,
      guildName: raid.guild.name,
      name: raid.name,
      dungeonName: raid.dungeon.name,
      scheduledAt: raid.scheduledAt,
      signupUntil: raid.signupUntil,
      status: raid.status,
      maxPlayers: raid.maxPlayers,
      signupCount: raid._count.signups,
      canEdit: false,
      accessMode: 'guest',
    });
  }

  return result;
}

export type ResolvedRaidAccess =
  | { ok: false; reason: 'guild_not_found' | 'raid_not_found' | 'raid_access_denied' }
  | {
      ok: true;
      guildInfo: UserGuildInfo;
      canEdit: boolean;
      canSignup: boolean;
      signupPhase: RaidSignupPhase;
      accessMode: RaidAccessMode;
    };

/** Erweiterte Zugriffsprüfung inkl. Gast-Pfad (ersetzt resolveRaidAccess-Logik). */
export async function resolveRaidAccessWithGuests(
  userId: string,
  discordId: string,
  guildId: string,
  raidId: string
): Promise<ResolvedRaidAccess> {
  const guilds = await getGuildsForUser(userId, discordId);
  const guildInfo = guilds.find((g) => g.id === guildId);

  const raid = await prisma.rfRaid.findFirst({
    where: { id: raidId, guildId },
    select: {
      id: true,
      guildId: true,
      allowGuests: true,
      raidGroupRestrictionId: true,
      status: true,
      signupUntil: true,
      scheduledAt: true,
    },
  });
  if (!raid) {
    return { ok: false, reason: 'raid_not_found' };
  }

  const signupPhase = computeRaidSignupPhase(raid);
  const canSignup = signupPhase !== 'closed';

  if (guildInfo && userGuildCanSeeRaid(guildInfo, raid)) {
    return {
      ok: true,
      guildInfo,
      canEdit: userGuildCanEditRaids(guildInfo),
      canSignup,
      signupPhase,
      accessMode: 'member',
    };
  }

  if (!raidAllowsGuestAccess(raid)) {
    return {
      ok: false,
      reason: guildInfo ? 'raid_access_denied' : 'guild_not_found',
    };
  }

  const guest = await resolveGuestEligibility(userId, discordId, guildId);
  if (!guest.eligible) {
    return {
      ok: false,
      reason: guildInfo ? 'raid_access_denied' : 'guild_not_found',
    };
  }

  const guestGuildInfo =
    guildInfo ?? (await buildGuestViewerGuildInfo(guildId));
  if (!guestGuildInfo) {
    return { ok: false, reason: 'guild_not_found' };
  }

  return {
    ok: true,
    guildInfo: guestGuildInfo,
    canEdit: false,
    canSignup,
    signupPhase,
    accessMode: 'guest',
  };
}
