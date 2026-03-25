import { prisma } from '@/lib/prisma';
import {
  getGuildsForUser,
  userGuildCanEditRaids,
  userGuildCanSeeRaid,
  type UserGuildInfo,
} from '@/lib/user-guilds';

export type RaidPageMode = 'view' | 'edit' | 'signup';

/** Nach Ablauf „Anmeldung bis“ nur noch Reserve; sonst volle Typen. */
export type RaidSignupPhase = 'full' | 'reserve_only' | 'closed';

export function computeRaidSignupPhase(raid: {
  status: string;
  signupUntil: Date;
}): RaidSignupPhase {
  if (raid.status !== 'open') return 'closed';
  if (Date.now() <= raid.signupUntil.getTime()) return 'full';
  return 'reserve_only';
}

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
          id: true,
          name: true,
          names: { where: { locale }, take: 1, select: { name: true } },
        },
      },
      raidGroupRestriction: { select: { id: true, name: true } },
      signups: {
        include: {
          character: { select: { id: true, name: true, mainSpec: true, offSpec: true, isMain: true } },
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
    signupPhase: access.signupPhase,
    raid,
  };
}

/** Anmeldeliste je nach signup_visibility und Rolle. Nach „Raid setzen“ (locked) ist die Liste bei raid_leader_only für alle sichtbar. */
export function filterSignupsVisibleToViewer<T extends { userId: string }>(
  signups: T[],
  viewerUserId: string,
  signupVisibility: string,
  canEdit: boolean,
  raidStatus?: string
): T[] {
  if (signupVisibility === 'public' || canEdit) {
    return signups;
  }
  if (raidStatus === 'locked') {
    return signups;
  }
  return signups.filter((s) => s.userId === viewerUserId);
}
