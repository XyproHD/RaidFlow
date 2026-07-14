/**
 * Zentrale Anzeige-Logik: Selbstanmeldung vs. Planer vs. veröffentlichter Stand.
 *
 * - public + open        → originalSignupType (Fallback: type)
 * - public + announced+  → announcedPlannerGroupsJson (Fallback: type/leaderPlacement)
 * - planner              → draftPlannerGroupsJson (open) bzw. announced JSON (nach Ankündigung)
 */

import {
  leaderPlacementFromAnnounceLayout,
  parseStoredAnnouncedPlannerJson,
  type AnnounceRaidPayload,
} from '@/lib/raid-announce';
import { signupTypeNorm, WITHDRAWN_SIGNUP_ORIGINAL_TYPE } from '@/lib/raid-signup-constants';
import { orderedReserveSignupIdsForDisplay } from '@/lib/planner-reserve-order';

export type SignupDisplayView = 'public' | 'planner';

/** Öffentliche Listen: Anmeldungen / Reserve / Absagen */
export type PublicSignupBucket = 'main' | 'reserve' | 'declined';

/** Planer-Listen: Kader / Reserve / Absage-Block / Pool */
export type PlannerSignupBucket = 'roster' | 'reserve' | 'decline' | 'pool';

export type SignupDisplayRow = {
  id: string;
  type: string;
  originalSignupType?: string | null;
  leaderPlacement?: string | null;
  setConfirmed?: boolean;
};

export type RaidDisplayContext = {
  status: string;
  draftPlannerGroupsJson?: unknown;
  announcedPlannerGroupsJson?: unknown;
};

export function effectiveOriginalSignupType(signup: SignupDisplayRow): string {
  const raw = signup.originalSignupType ?? signup.type;
  return signupTypeNorm(raw);
}

export function isPublishedRaidStatus(status: string): boolean {
  return status === 'announced' || status === 'locked' || status === 'completed';
}

export function parsePlannerLayoutForView(
  raid: RaidDisplayContext,
  view: SignupDisplayView
): AnnounceRaidPayload | null {
  if (view === 'planner') {
    if (raid.status === 'open') {
      return parseStoredAnnouncedPlannerJson(raid.draftPlannerGroupsJson);
    }
    if (isPublishedRaidStatus(raid.status)) {
      return (
        parseStoredAnnouncedPlannerJson(raid.announcedPlannerGroupsJson) ??
        parseStoredAnnouncedPlannerJson(raid.draftPlannerGroupsJson)
      );
    }
    return null;
  }

  if (isPublishedRaidStatus(raid.status)) {
    return parseStoredAnnouncedPlannerJson(raid.announcedPlannerGroupsJson);
  }
  return null;
}

function rosterIdSet(layout: AnnounceRaidPayload): Set<string> {
  return new Set(layout.groups.flatMap((g) => g.rosterOrder));
}

/** Bucket für öffentliche Raid-Detail- / Discord-Ansicht. */
export function publicSignupBucket(
  signup: SignupDisplayRow,
  raid: RaidDisplayContext
): PublicSignupBucket {
  if (raid.status === 'cancelled') {
    return 'declined';
  }

  const published = parsePlannerLayoutForView(raid, 'public');
  if (published && isPublishedRaidStatus(raid.status)) {
    const roster = rosterIdSet(published);
    if (roster.has(signup.id)) return 'main';
    if (published.declineOrder.includes(signup.id)) return 'declined';
    if (published.reserveOrder.includes(signup.id)) return 'reserve';
    return publishedFallbackBucket(signup);
  }

  const orig = effectiveOriginalSignupType(signup);
  if (orig === 'declined' || orig === WITHDRAWN_SIGNUP_ORIGINAL_TYPE) return 'declined';
  if (orig === 'reserve') return 'reserve';
  return 'main';
}

/** Legacy-Raids ohne veröffentlichtes JSON: type/leaderPlacement. */
function publishedFallbackBucket(signup: SignupDisplayRow): PublicSignupBucket {
  const tn = signupTypeNorm(signup.type);
  if (tn === 'declined') return 'declined';
  if (signup.leaderPlacement === 'confirmed' || signup.setConfirmed) return 'main';
  if (signup.leaderPlacement === 'substitute' || tn === 'reserve') return 'reserve';
  if (tn === 'reserve') return 'reserve';
  return 'main';
}

export function plannerSignupBucket(
  signup: SignupDisplayRow,
  layout: AnnounceRaidPayload | null
): PlannerSignupBucket {
  if (!layout) return 'pool';
  const roster = rosterIdSet(layout);
  if (roster.has(signup.id)) return 'roster';
  if (layout.declineOrder.includes(signup.id)) return 'decline';
  if (layout.reserveOrder.includes(signup.id)) return 'reserve';
  return 'pool';
}

export function filterSignupsByPublicBucket<T extends SignupDisplayRow>(
  signups: T[],
  raid: RaidDisplayContext,
  bucket: PublicSignupBucket
): T[] {
  return signups.filter((s) => publicSignupBucket(s, raid) === bucket);
}

export function orderedPublicReserveIds(
  signups: SignupDisplayRow[],
  raid: RaidDisplayContext
): string[] {
  const published = parsePlannerLayoutForView(raid, 'public');
  const meta = signups.map((s) => ({ id: s.id, type: s.type }));

  if (published && isPublishedRaidStatus(raid.status)) {
    const roster = rosterIdSet(published);
    return orderedReserveSignupIdsForDisplay(published.reserveOrder, meta).filter(
      (id) => !roster.has(id)
    );
  }

  return signups
    .filter((s) => publicSignupBucket(s, raid) === 'reserve')
    .map((s) => s.id);
}

export function orderedPlannerReserveIds(
  signups: SignupDisplayRow[],
  layout: AnnounceRaidPayload | null
): string[] {
  if (!layout) {
    return signups
      .filter((s) => signupTypeNorm(s.type) === 'reserve')
      .map((s) => s.id);
  }
  const roster = rosterIdSet(layout);
  const meta = signups.map((s) => ({ id: s.id, type: s.type }));
  return orderedReserveSignupIdsForDisplay(layout.reserveOrder, meta).filter(
    (id) => !roster.has(id)
  );
}

export function publishedRosterIds(raid: RaidDisplayContext): string[] {
  const published = parsePlannerLayoutForView(raid, 'public');
  if (!published || !isPublishedRaidStatus(raid.status)) return [];
  return published.groups.flatMap((g) => g.rosterOrder);
}

export function publishedDeclineIds(raid: RaidDisplayContext): string[] {
  const published = parsePlannerLayoutForView(raid, 'public');
  if (!published || !isPublishedRaidStatus(raid.status)) return [];
  return [...published.declineOrder];
}

/** Für Zählungen in der öffentlichen Übersicht (offen: Anmeldung, veröffentlicht: Kader). */
export function signupsForPublicRoleCounts<T extends SignupDisplayRow>(
  signups: T[],
  raid: RaidDisplayContext
): T[] {
  if (isPublishedRaidStatus(raid.status)) {
    const rosterIds = new Set(publishedRosterIds(raid));
    if (rosterIds.size > 0) {
      return signups.filter((s) => rosterIds.has(s.id));
    }
    return filterSignupsByPublicBucket(signups, raid, 'main');
  }
  return filterSignupsByPublicBucket(signups, raid, 'main');
}

/** Vergleich Planer ↔ Ankündigung (Dashboard). */
export function comparisonPlacementFromLayouts(
  signup: SignupDisplayRow,
  layout: AnnounceRaidPayload | null
): 'confirmed' | 'reserve' | 'uncertain' | 'signup' {
  const orig = effectiveOriginalSignupType(signup);
  if (orig === 'uncertain') return 'uncertain';

  if (layout) {
    const lp = leaderPlacementFromAnnounceLayout(signup.id, layout);
    if (lp === 'confirmed') return 'confirmed';
    if (lp === 'substitute') return 'reserve';
    return 'signup';
  }

  if (signup.leaderPlacement === 'confirmed' || signup.setConfirmed) return 'confirmed';
  if (signup.leaderPlacement === 'substitute' || orig === 'reserve') return 'reserve';
  return 'signup';
}
