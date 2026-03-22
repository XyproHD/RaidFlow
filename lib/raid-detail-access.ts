import { prisma } from '@/lib/prisma';
import {
  getGuildsForUser,
  userGuildCanEditRaids,
  userGuildCanSeeRaid,
  type UserGuildInfo,
} from '@/lib/user-guilds';

export type RaidPageMode = 'view' | 'edit' | 'signup';

/**
 * Query-Parameter `mode` oder `modus` (deutsche Aliase).
 * Standard: Anzeigen (view), wenn kein oder unbekannter Wert.
 */
export function parseRaidPageMode(searchParams: {
  mode?: string;
  modus?: string;
}): RaidPageMode {
  const raw = (searchParams.mode ?? searchParams.modus ?? 'view').toLowerCase().trim();
  if (raw === '' || raw === 'view' || raw === 'anzeigen') return 'view';
  if (raw === 'edit' || raw === 'bearbeiten') return 'edit';
  if (raw === 'signup' || raw === 'anmelden') return 'signup';
  return 'view';
}

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
          name: true,
          names: { where: { locale }, take: 1, select: { name: true } },
        },
      },
      raidGroupRestriction: { select: { id: true, name: true } },
      signups: {
        include: {
          character: { select: { id: true, name: true } },
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
      canSignup: boolean;
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
  const canSignup =
    raid.status === 'open' && Date.now() <= raid.signupUntil.getTime();

  return { ok: true, guildInfo, canEdit, canSignup };
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
      raid: NonNullable<Awaited<ReturnType<typeof loadRaidForDetailPage>>>;
    }
> {
  const access = await resolveRaidAccess(userId, discordId, guildId, raidId);
  if (!access.ok) return access;

  const raid = await loadRaidForDetailPage(guildId, raidId, locale);
  if (!raid) {
    return { ok: false, reason: 'raid_not_found' };
  }

  return {
    ok: true,
    guildInfo: access.guildInfo,
    canEdit: access.canEdit,
    canSignup: access.canSignup,
    raid,
  };
}

/** Anmeldeliste je nach signup_visibility und Rolle. */
export function filterSignupsVisibleToViewer<T extends { userId: string }>(
  signups: T[],
  viewerUserId: string,
  signupVisibility: string,
  canEdit: boolean
): T[] {
  if (signupVisibility === 'public' || canEdit) {
    return signups;
  }
  return signups.filter((s) => s.userId === viewerUserId);
}
