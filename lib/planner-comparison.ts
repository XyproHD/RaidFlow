import {
  leaderPlacementFromAnnounceLayout,
  parseStoredAnnouncedPlannerJson,
  type AnnounceRaidPayload,
} from '@/lib/raid-announce';

export type ComparisonPlacement = 'confirmed' | 'reserve' | 'uncertain' | 'signup';

function signupTypeNorm(v: string): string {
  return v === 'main' ? 'normal' : v;
}

export function comparisonPlacementForSignup(
  signup: { id: string; type: string; leaderPlacement?: string | null; setConfirmed?: boolean },
  layout: AnnounceRaidPayload | null
): ComparisonPlacement {
  const tn = signupTypeNorm(signup.type);
  if (tn === 'uncertain') return 'uncertain';

  if (layout) {
    const lp = leaderPlacementFromAnnounceLayout(signup.id, layout);
    if (lp === 'confirmed') return 'confirmed';
    if (lp === 'substitute') return 'reserve';
    return 'signup';
  }

  if (signup.leaderPlacement === 'confirmed' || signup.setConfirmed) return 'confirmed';
  if (signup.leaderPlacement === 'substitute' || tn === 'reserve') return 'reserve';
  return 'signup';
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
