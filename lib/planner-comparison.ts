import { parseStoredAnnouncedPlannerJson } from '@/lib/raid-announce';
import {
  comparisonPlacementFromLayouts,
  type SignupDisplayRow,
} from '@/lib/raid-signup-display';

export type ComparisonPlacement = 'confirmed' | 'reserve' | 'uncertain' | 'signup';

export function comparisonPlacementForSignup(
  signup: SignupDisplayRow,
  layout: import('@/lib/raid-announce').AnnounceRaidPayload | null
): ComparisonPlacement {
  return comparisonPlacementFromLayouts(signup, layout);
}

export function buildComparisonPlacementByUserId(
  signups: {
    id: string;
    userId: string;
    type: string;
    leaderPlacement?: string | null;
    setConfirmed?: boolean;
  }[],
  draftPlannerGroupsJson: unknown,
  announcedPlannerGroupsJson: unknown,
  raidStatus: string
): Map<string, ComparisonPlacement> {
  const layout =
    raidStatus === 'open'
      ? parseStoredAnnouncedPlannerJson(draftPlannerGroupsJson)
      : parseStoredAnnouncedPlannerJson(announcedPlannerGroupsJson) ??
        parseStoredAnnouncedPlannerJson(draftPlannerGroupsJson);

  const out = new Map<string, ComparisonPlacement>();
  for (const s of signups) {
    const uid = s.userId?.trim();
    if (!uid) continue;
    const placement = comparisonPlacementForSignup(s, layout);
    const prev = out.get(uid);
    if (!prev) {
      out.set(uid, placement);
      continue;
    }
    const rank: Record<ComparisonPlacement, number> = {
      confirmed: 4,
      reserve: 3,
      uncertain: 2,
      signup: 1,
    };
    if (rank[placement] > rank[prev]) out.set(uid, placement);
  }
  return out;
}
