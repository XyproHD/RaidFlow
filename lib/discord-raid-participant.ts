import { prisma } from '@/lib/prisma';
import { getAppConfig } from '@/lib/app-config';
import { getGuildsForUser, userGuildCanSeeRaid } from '@/lib/user-guilds';
import { computeRaidSignupPhase } from '@/lib/raid-detail-shared';
import { syncDiscordUserGuildMemberships } from '@/lib/sync-user-guild-memberships';
import {
  raidAllowsGuestAccess,
  resolveGuestEligibility,
  assignCharacterForGuestSignup,
} from '@/lib/guest-raid-access';

function profileUrlForLocale(locale = 'de'): string {
  const base = process.env.NEXTAUTH_URL?.replace(/\/$/, '') || 'http://localhost:3000';
  return `${base}/${locale}/profile`;
}

export type RaidParticipantState = {
  linked: boolean;
  guildMember: boolean;
  /** Gast-Anmeldung auf allowGuests-Raid möglich */
  guestEligible: boolean;
  raidGuildId: string;
  raidGuildName: string;
  characters: Array<{
    id: string;
    name: string;
    mainSpec: string;
    offSpec: string | null;
    isMain: boolean;
  }>;
  assignableCharacters: Array<{
    id: string;
    name: string;
    mainSpec: string;
    offSpec: string | null;
    isMain: boolean;
    guildId: string | null;
  }>;
  profileUrl: string;
  signupPhase: ReturnType<typeof computeRaidSignupPhase>;
  discordEmojis: Record<string, string>;
};

export async function buildRaidParticipantState(
  discordUserId: string,
  raidId: string,
  options?: { locale?: string; syncDiscordGuildId?: string | null }
): Promise<RaidParticipantState | null> {
  const raid = await prisma.rfRaid.findUnique({
    where: { id: raidId },
    select: {
      id: true,
      guildId: true,
      allowGuests: true,
      signupUntil: true,
      scheduledAt: true,
      status: true,
      raidGroupRestrictionId: true,
      guild: { select: { id: true, name: true, discordGuildId: true } },
    },
  });
  if (!raid) return null;

  const discordGuildId = options?.syncDiscordGuildId ?? raid.guild.discordGuildId;
  const syncResult = await syncDiscordUserGuildMemberships({
    discordUserId,
    discordGuildId: discordGuildId ?? undefined,
  });

  const user = await prisma.rfUser.findUnique({
    where: { discordId: discordUserId },
    select: { id: true },
  });
  if (!user) {
    return {
      linked: false,
      guildMember: false,
      guestEligible: false,
      raidGuildId: raid.guildId,
      raidGuildName: raid.guild.name,
      characters: [],
      assignableCharacters: [],
      profileUrl: profileUrlForLocale(options?.locale),
      signupPhase: computeRaidSignupPhase(raid),
      discordEmojis: {},
    };
  }

  const [guilds, charsInGuild, assignable, appCfg, guestCheck] = await Promise.all([
    getGuildsForUser(syncResult.userId, discordUserId, { skipOwnerWebFullAccess: true }),
    prisma.rfCharacter.findMany({
      where: { userId: syncResult.userId, guildId: raid.guildId },
      select: { id: true, name: true, mainSpec: true, offSpec: true, isMain: true },
      orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
      take: 25,
    }),
    prisma.rfCharacter.findMany({
      where: {
        userId: syncResult.userId,
        OR: [{ guildId: null }, { guildId: { not: raid.guildId } }],
      },
      select: {
        id: true,
        name: true,
        mainSpec: true,
        offSpec: true,
        isMain: true,
        guildId: true,
      },
      orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
      take: 25,
    }),
    getAppConfig().catch(() => null),
    raidAllowsGuestAccess(raid)
      ? resolveGuestEligibility(syncResult.userId, discordUserId, raid.guildId)
      : Promise.resolve({ eligible: false, membershipKnown: true, displayNameInGuild: null }),
  ]);

  const guildInfo = guilds.find((g) => g.id === raid.guildId);
  const guildMember =
    !!guildInfo &&
    guildInfo.role !== 'member' &&
    userGuildCanSeeRaid(guildInfo, {
      guildId: raid.guildId,
      raidGroupRestrictionId: raid.raidGroupRestrictionId,
    });

  const guestEligible = !guildMember && guestCheck.eligible;

  const profileChars =
    guestEligible && assignable.length > 0
      ? [...assignable, ...charsInGuild.filter((c) => !assignable.some((a) => a.id === c.id))]
      : charsInGuild;

  return {
    linked: true,
    guildMember: guildMember || guestEligible,
    guestEligible,
    raidGuildId: raid.guildId,
    raidGuildName: raid.guild.name,
    characters: profileChars,
    assignableCharacters: assignable,
    profileUrl: profileUrlForLocale(options?.locale),
    signupPhase: computeRaidSignupPhase(raid),
    discordEmojis: appCfg?.discordEmojis ?? {},
  };
}

export async function assignCharacterToRaidGuild(params: {
  discordUserId: string;
  raidId: string;
  characterId: string;
}): Promise<
  | { ok: true; characterId: string }
  | { ok: false; error: string; message: string; status: number }
> {
  const state = await buildRaidParticipantState(params.discordUserId, params.raidId);
  if (!state) {
    return { ok: false, error: 'RAID_NOT_FOUND', message: 'Raid nicht gefunden.', status: 404 };
  }
  if (!state.linked) {
    return {
      ok: false,
      error: 'NOT_LINKED',
      message: 'Discord-Konto ist nicht mit RaidFlow verknüpft.',
      status: 403,
    };
  }
  if (!state.guildMember) {
    return {
      ok: false,
      error: 'NOT_GUILD_MEMBER',
      message: 'Du bist kein RaidFlow-Mitglied dieser Gilde.',
      status: 403,
    };
  }

  const user = await prisma.rfUser.findUnique({
    where: { discordId: params.discordUserId },
    select: { id: true },
  });
  if (!user) {
    return {
      ok: false,
      error: 'NOT_LINKED',
      message: 'Discord-Konto ist nicht mit RaidFlow verknüpft.',
      status: 403,
    };
  }

  if (state.guestEligible) {
    const guest = await resolveGuestEligibility(user.id, params.discordUserId, state.raidGuildId);
    const assigned = await assignCharacterForGuestSignup({
      userId: user.id,
      characterId: params.characterId,
      guildId: state.raidGuildId,
      discordId: params.discordUserId,
      displayNameInGuild: guest.displayNameInGuild,
    });
    if (!assigned.ok) {
      return {
        ok: false,
        error: 'CHARACTER_NOT_FOUND',
        message: assigned.error,
        status: assigned.status,
      };
    }
    return { ok: true, characterId: params.characterId };
  }

  const char = await prisma.rfCharacter.findFirst({
    where: {
      id: params.characterId,
      userId: user.id,
      OR: [{ guildId: null }, { guildId: { not: state.raidGuildId } }],
    },
    select: { id: true, guildId: true },
  });
  if (!char) {
    return {
      ok: false,
      error: 'CHARACTER_NOT_FOUND',
      message: 'Charakter nicht gefunden oder bereits dieser Gilde zugeordnet.',
      status: 404,
    };
  }

  const shouldBeMain = !(await prisma.rfCharacter.findFirst({
    where: { userId: user.id, guildId: state.raidGuildId },
    select: { id: true },
  }));

  await prisma.rfCharacter.update({
    where: { id: char.id },
    data: {
      guildId: state.raidGuildId,
      isMain: shouldBeMain,
    },
  });

  return { ok: true, characterId: char.id };
}
