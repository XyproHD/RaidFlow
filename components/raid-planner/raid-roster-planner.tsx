'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { formatRaidTerminLine } from '@/lib/format-raid-termin';
import { getSpecByDisplayName, TBC_CLASS_IDS, type TbcRole } from '@/lib/wow-tbc-classes';
import { isMinSpecClassKey, minSpecKeyTitle, parseMinSpecClassKey } from '@/lib/min-spec-keys';
import { roleFromSpecDisplayName } from '@/lib/spec-to-role';
import { ClassIcon } from '@/components/class-icon';
import { RoleIcon } from '@/components/role-icon';
import { CharacterMainStar } from '@/components/character-main-star';
import {
  CharacterDiscordPill,
  CharacterForbidReserveBadge,
  CharacterGearscorePill,
  CharacterSignupPunctualityMark,
  CharacterSpecIconsInline,
} from '@/components/character-display-parts';
import { SpecIcon } from '@/components/spec-icon';
import {
  RaidOverviewSummaryRows,
  type RaidOverviewSummaryProps,
} from '@/components/raid-detail/raid-overview-summary';

const ROLE_ORDER: TbcRole[] = ['Tank', 'Healer', 'Melee', 'Range'];
const ROLE_KEYS = ['Tank', 'Melee', 'Range', 'Healer'] as const;

const RAID_PLANNER_CLASS_I18N = {
  druid: 'classDruid',
  hunter: 'classHunter',
  mage: 'classMage',
  paladin: 'classPaladin',
  priest: 'classPriest',
  rogue: 'classRogue',
  shaman: 'classShaman',
  warlock: 'classWarlock',
  warrior: 'classWarrior',
} as const;

type MainAltFilter = 'mains' | 'both' | 'twinks';
type PlannerPunctuality = 'on_time' | 'tight' | 'late';

export type RosterPlannerSignup = {
  id: string;
  userId?: string | null;
  characterId?: string | null;
  /** CharacterId as loaded from DB (for detecting leader changes) */
  originalCharacterId?: string | null;
  name: string;
  mainSpec: string;
  offSpec?: string | null;
  classId: string | null;
  isMain: boolean;
  role: TbcRole;
  signedSpec?: string | null;
  originalSignedSpec?: string | null;
  onlySignedSpec?: boolean;
  /** DB: normal | uncertain | reserve (main treated as normal) */
  signupType: string;
  /** DB: signup | substitute | confirmed */
  leaderPlacement?: 'signup' | 'substitute' | 'confirmed';
  isLate: boolean;
  punctuality?: PlannerPunctuality | null;
  forbidReserve?: boolean;
  discordName?: string | null;
  gearScore?: number | null;
  note?: string | null;
  /** Profil-Fokus Werktag/Wochenende; fehlt = beide Filter erlauben */
  profileWeekFocus?: 'weekday' | 'weekend' | null;
};

export type GuildCharacterOption = {
  id: string;
  userId: string;
  name: string;
  mainSpec: string;
  offSpec: string | null;
  isMain: boolean;
  gearScore: number | null;
  guildDiscordDisplayName: string | null;
  classId: string | null;
  role: TbcRole;
};

type RaidHeaderMeta = {
  name: string;
  scheduledAt: string;
  scheduledEndAt: string | null;
  guildName: string;
  dungeonLabel: string;
  maxPlayers: number;
};

type DragSession = {
  signupId: string;
  source: 'roster' | 'reserve' | 'pool';
  offsetX: number;
  offsetY: number;
  originRect: DOMRect;
  pointerId: number;
};

type FlyBackState = {
  signupId: string;
  fromLeft: number;
  fromTop: number;
  toLeft: number;
  toTop: number;
  width: number;
  height: number;
};

type PlannerGroup = {
  rosterOrder: string[];
  raidLeaderUserId: string | null;
  lootmasterUserId: string | null;
};

type DropTarget =
  | { kind: 'roster'; groupIndex: number }
  | { kind: 'reserve' }
  | { kind: 'pool' };

function findDropTarget(x: number, y: number): DropTarget | null {
  const stack = document.elementsFromPoint(x, y);
  for (const el of stack) {
    if (!(el instanceof HTMLElement)) continue;
    const z = el.dataset.dropZone;
    if (z === 'pool') return { kind: 'pool' };
    if (z === 'reserve') return { kind: 'reserve' };
    if (z === 'roster') {
      const raw = el.dataset.rosterGroup ?? '0';
      const gi = Number.parseInt(raw, 10);
      return { kind: 'roster', groupIndex: Number.isFinite(gi) && gi >= 0 ? gi : 0 };
    }
  }
  return null;
}

function allRosterIds(groups: PlannerGroup[]): string[] {
  return groups.flatMap((g) => g.rosterOrder);
}

function findUserRosterConflict(
  groups: PlannerGroup[],
  byId: Map<string, RosterPlannerSignup>,
  draggingId: string,
  userId: string
): string | null {
  for (const g of groups) {
    for (const otherId of g.rosterOrder) {
      if (otherId === draggingId) continue;
      const other = byId.get(otherId);
      if ((other?.userId ?? '').trim() === userId) return otherId;
    }
  }
  return null;
}

function dedupeRosterIdsAcrossGroups(groups: PlannerGroup[]): PlannerGroup[] {
  const seen = new Set<string>();
  return groups.map((g) => {
    const next: string[] = [];
    for (const id of g.rosterOrder) {
      if (seen.has(id)) continue;
      seen.add(id);
      next.push(id);
    }
    return { ...g, rosterOrder: next };
  });
}

function roleCountsForRosterOrder(
  rosterOrder: string[],
  byId: Map<string, RosterPlannerSignup>
): Record<(typeof ROLE_KEYS)[number], number> {
  const out: Record<(typeof ROLE_KEYS)[number], number> = { Tank: 0, Melee: 0, Range: 0, Healer: 0 };
  for (const id of rosterOrder) {
    const s = byId.get(id);
    if (!s) continue;
    const r = s.role;
    if (r === 'Tank' || r === 'Melee' || r === 'Range' || r === 'Healer') out[r] += 1;
  }
  return out;
}

function minSpecKeyCountsForRosterOrder(
  rosterOrder: string[],
  byId: Map<string, RosterPlannerSignup>,
  minSpecsObj: Record<string, number> | null | undefined
): Map<string, number> {
  const out = new Map<string, number>();
  const minSpecs = minSpecsObj
    ? Object.entries(minSpecsObj).filter(([, n]) => typeof n === 'number' && n > 0)
    : [];
  for (const [key] of minSpecs) {
    let n = 0;
    for (const id of rosterOrder) {
      const s = byId.get(id);
      if (!s) continue;
      const spec = (s.signedSpec?.trim() || s.mainSpec?.trim() || '').trim();
      if (!spec) continue;
      if (isMinSpecClassKey(key)) {
        const cid = parseMinSpecClassKey(key);
        if (cid && getSpecByDisplayName(spec)?.classId === cid) n++;
      } else if (spec === key) {
        n++;
      }
    }
    out.set(key, n);
  }
  return out;
}

function rosterMinFulfillmentRatioForOrder(
  rosterOrder: string[],
  byId: Map<string, RosterPlannerSignup>,
  overviewProps: RaidOverviewSummaryProps
): number | null {
  const rosterRoleCounts = roleCountsForRosterOrder(rosterOrder, byId);
  const rosterMinSpecKeyCounts = minSpecKeyCountsForRosterOrder(
    rosterOrder,
    byId,
    overviewProps.minSpecsObj
  );
  const roleMin = overviewProps.roleMinByKey;
  const ratios: number[] = [];
  for (const k of ROLE_KEYS) {
    const need = roleMin[k] ?? 0;
    if (need <= 0) continue;
    ratios.push(Math.min(1, (rosterRoleCounts[k] ?? 0) / need));
  }
  const minSpecs = overviewProps.minSpecsObj
    ? Object.entries(overviewProps.minSpecsObj).filter(([, n]) => typeof n === 'number' && n > 0)
    : [];
  for (const [spec, need] of minSpecs) {
    ratios.push(Math.min(1, (rosterMinSpecKeyCounts.get(spec) ?? 0) / need));
  }
  if (ratios.length === 0) return null;
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

function openMenuAtButton(btn: HTMLButtonElement) {
  const r = btn.getBoundingClientRect();
  const width = 200;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width));
  const top = Math.min(window.innerHeight - 8, r.bottom + 6);
  return { top, left };
}

function typeNorm(v: string) {
  return v === 'main' ? 'normal' : v;
}

function reserveSignupIdsFrom(signups: RosterPlannerSignup[]): string[] {
  return signups.filter((s) => typeNorm(s.signupType) === 'reserve').map((s) => s.id);
}

function punctualityOf(s: RosterPlannerSignup): PlannerPunctuality {
  const p = s.punctuality;
  if (p === 'tight' || p === 'late' || p === 'on_time') return p;
  return s.isLate ? 'late' : 'on_time';
}

function countToMinLabel(count: number, min: number) {
  if (min > 0 && count < min) return `${count}/${min}`;
  return String(count);
}

function toneForFulfillment(ratio: number | null) {
  if (ratio == null) return 'text-muted-foreground';
  if (ratio >= 1) return 'text-green-600 dark:text-green-500';
  if (ratio >= 0.5) return 'text-amber-600 dark:text-amber-500';
  return 'text-destructive';
}

function setFromArray(ids: (string | null | undefined)[]) {
  return new Set(ids.filter((x): x is string => typeof x === 'string' && x.length > 0));
}

function rosterInsertIndex(container: HTMLElement, clientY: number, draggingId: string): number {
  const rows = [...container.querySelectorAll<HTMLElement>('[data-planner-row]')];
  let idx = 0;
  for (const el of rows) {
    if (el.dataset.signupId === draggingId) continue;
    const r = el.getBoundingClientRect();
    if (clientY < r.top + r.height / 2) return idx;
    idx++;
  }
  return idx;
}

export function RaidRosterPlanner({
  locale,
  guildId,
  raidId,
  raid,
  overviewProps,
  initialSignups,
  guildCharacters,
  raidLeaderLabel,
  canEditRaid,
  initialRaidLeaderUserId,
  initialLootmasterUserId,
}: {
  locale: string;
  guildId: string;
  raidId: string;
  raid: RaidHeaderMeta;
  overviewProps: RaidOverviewSummaryProps;
  initialSignups: RosterPlannerSignup[];
  guildCharacters: GuildCharacterOption[];
  raidLeaderLabel: string;
  canEditRaid: boolean;
  initialRaidLeaderUserId: string | null;
  initialLootmasterUserId: string | null;
}) {
  const t = useTranslations('raidDetail');
  const tEdit = useTranslations('raidEdit');
  const tRoster = useTranslations('raidRosterPlanner');
  const tPlanner = useTranslations('raidPlanner');
  const tProfile = useTranslations('profile');
  const router = useRouter();
  const intlLocale = useLocale();

  const [signups, setSignups] = useState<RosterPlannerSignup[]>(() => initialSignups);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<{
    signups: RosterPlannerSignup[];
    plannerGroups: PlannerGroup[];
    reserveOrder: string[];
  } | null>(null);

  const orderStorageKey = useMemo(() => `rf:raidPlannerOrder:${raidId}`, [raidId]);
  useEffect(() => {
    setSignups(initialSignups);
    setReserveOrder((prev) => {
      const want = reserveSignupIdsFrom(initialSignups);
      const wantSet = new Set(want);
      const next: string[] = [];
      for (const id of prev) {
        if (wantSet.has(id)) next.push(id);
      }
      for (const id of want) {
        if (!next.includes(id)) next.push(id);
      }
      return next;
    });
  }, [initialSignups]);

  const byId = useMemo(() => new Map(signups.map((s) => [s.id, s])), [signups]);

  const [plannerGroups, setPlannerGroups] = useState<PlannerGroup[]>(() => [
    {
      rosterOrder: [],
      raidLeaderUserId: initialRaidLeaderUserId,
      lootmasterUserId: initialLootmasterUserId,
    },
  ]);
  const [reserveOrder, setReserveOrder] = useState<string[]>(() => reserveSignupIdsFrom(initialSignups));

  function safeJsonParse<T>(raw: string | null): T | null {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  const applySavedOrders = useCallback(
    (rows: RosterPlannerSignup[]) => {
      const ids = rows.map((s) => s.id);
      const idsSet = new Set(ids);
      const placementOf = (id: string): 'signup' | 'substitute' | 'confirmed' => {
        const row = rows.find((x) => x.id === id);
        const p = row?.leaderPlacement;
        return p === 'confirmed' || p === 'substitute' || p === 'signup' ? p : 'signup';
      };

      type StoredPlanner = {
        rosterOrder?: unknown;
        reserveOrder?: unknown;
        groups?: unknown;
      };

      const stored =
        typeof window !== 'undefined'
          ? safeJsonParse<StoredPlanner>(window.localStorage.getItem(orderStorageKey))
          : null;
      const storedRoster =
        stored && Array.isArray(stored.rosterOrder)
          ? (stored.rosterOrder.filter((x) => typeof x === 'string') as string[])
          : null;
      const storedReserve =
        stored && Array.isArray(stored.reserveOrder)
          ? (stored.reserveOrder.filter((x) => typeof x === 'string') as string[])
          : null;

      const normalize = (arr: string[] | null) => {
        if (!arr) return [];
        const out: string[] = [];
        for (const id of arr) {
          if (!idsSet.has(id)) continue;
          if (!out.includes(id)) out.push(id);
        }
        return out;
      };

      let nextReserve = normalize(storedReserve);

      const defaultGroup = (): PlannerGroup => ({
        rosterOrder: [],
        raidLeaderUserId: initialRaidLeaderUserId,
        lootmasterUserId: initialLootmasterUserId,
      });

      let nextGroups: PlannerGroup[];

      const rawGroups = stored && Array.isArray(stored.groups) ? stored.groups : null;
      if (rawGroups && rawGroups.length > 0) {
        nextGroups = rawGroups.map((g, idx) => {
          const o = g as Record<string, unknown>;
          const ordRaw = o.rosterOrder;
          const ord = Array.isArray(ordRaw)
            ? normalize(ordRaw.filter((x): x is string => typeof x === 'string'))
            : [];
          const rl =
            typeof o.raidLeaderUserId === 'string' && o.raidLeaderUserId.trim()
              ? o.raidLeaderUserId.trim()
              : idx === 0
                ? initialRaidLeaderUserId
                : null;
          const lm =
            typeof o.lootmasterUserId === 'string' && o.lootmasterUserId.trim()
              ? o.lootmasterUserId.trim()
              : idx === 0
                ? initialLootmasterUserId
                : null;
          return { rosterOrder: ord, raidLeaderUserId: rl, lootmasterUserId: lm };
        });
        if (nextReserve.length === 0) {
          nextReserve = ids.filter((id) => placementOf(id) === 'substitute');
        }
      } else {
        let nextRoster = normalize(storedRoster);
        if (nextRoster.length === 0 && nextReserve.length === 0) {
          nextRoster = ids.filter((id) => placementOf(id) === 'confirmed');
          nextReserve = ids.filter((id) => placementOf(id) === 'substitute');
        }
        const placed = new Set([...nextRoster, ...nextReserve]);
        const remaining = ids.filter((id) => !placed.has(id));
        for (const id of remaining) {
          const p = placementOf(id);
          if (p === 'confirmed') nextRoster.push(id);
          else if (p === 'substitute') nextReserve.push(id);
        }
        nextRoster = nextRoster.filter((id) => placementOf(id) === 'confirmed');
        nextReserve = nextReserve.filter((id) => placementOf(id) === 'substitute');
        nextGroups = [
          {
            rosterOrder: nextRoster,
            raidLeaderUserId: initialRaidLeaderUserId,
            lootmasterUserId: initialLootmasterUserId,
          },
        ];
      }

      nextReserve = nextReserve.filter((id) => placementOf(id) === 'substitute');

      const placedRoster = new Set(allRosterIds(nextGroups));
      for (const id of ids) {
        if (placedRoster.has(id) || nextReserve.includes(id)) continue;
        const p = placementOf(id);
        if (p === 'substitute') nextReserve.push(id);
      }
      nextReserve = nextReserve.filter((id) => placementOf(id) === 'substitute');

      nextGroups = dedupeRosterIdsAcrossGroups(
        nextGroups.map((g) => ({
          ...g,
          rosterOrder: g.rosterOrder.filter((id) => placementOf(id) === 'confirmed'),
        }))
      );

      if (nextGroups.length === 0) {
        nextGroups = [defaultGroup()];
      }

      const rosterSet = new Set(allRosterIds(nextGroups));
      const missingConfirmed = ids.filter(
        (id) => placementOf(id) === 'confirmed' && !rosterSet.has(id) && !nextReserve.includes(id)
      );
      if (missingConfirmed.length > 0) {
        nextGroups = nextGroups.map((g, i) =>
          i === 0 ? { ...g, rosterOrder: [...g.rosterOrder, ...missingConfirmed] } : g
        );
        nextGroups = dedupeRosterIdsAcrossGroups(nextGroups);
      }

      setPlannerGroups(nextGroups);
      setReserveOrder(nextReserve);

      setSavedSnapshot({
        signups: rows,
        plannerGroups: nextGroups,
        reserveOrder: nextReserve,
      });
    },
    [orderStorageKey, initialRaidLeaderUserId, initialLootmasterUserId]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    applySavedOrders(initialSignups);
  }, [raidId, initialSignups, applySavedOrders]);

  const [mainAltFilter, setMainAltFilter] = useState<MainAltFilter>('both');
  const [allowWeekday, setAllowWeekday] = useState(true);
  const [allowWeekend, setAllowWeekend] = useState(true);
  const [roleFilter, setRoleFilter] = useState<Record<TbcRole, boolean>>({
    Tank: true,
    Healer: true,
    Melee: true,
    Range: true,
  });
  const [classFilter, setClassFilter] = useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    for (const id of TBC_CLASS_IDS) o[id] = true;
    return o;
  });
  const [punctualityFilter, setPunctualityFilter] = useState<Record<PlannerPunctuality, boolean>>({
    on_time: true,
    tight: true,
    late: true,
  });
  const [pulseForbidReserveId, setPulseForbidReserveId] = useState<string | null>(null);

  const [leaderMenuOpen, setLeaderMenuOpen] = useState(false);
  const [leaderMenuPos, setLeaderMenuPos] = useState<{ top: number; left: number } | null>(null);

  const [openNote, setOpenNote] = useState<{ name: string; note: string } | null>(null);
  const [blinkDiscordForIds, setBlinkDiscordForIds] = useState<Set<string>>(() => new Set());

  const [filtersOpen, setFiltersOpen] = useState(true);
  const [raidOptionsOpen, setRaidOptionsOpen] = useState(true);
  /** Dummy UI state (no backend yet) */
  const [unsetPlayersMode, setUnsetPlayersMode] = useState<'reserve' | 'decline'>('reserve');
  const [botNotifyTargets, setBotNotifyTargets] = useState({
    roster: true,
    reserve: false,
    decline: false,
  });
  const [changeNotifyTargets, setChangeNotifyTargets] = useState({
    channel: true,
    leader: false,
  });

  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addSelectedId, setAddSelectedId] = useState<string | null>(null);

  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const [dragPoint, setDragPoint] = useState<{ clientX: number; clientY: number } | null>(null);
  const [flyBack, setFlyBack] = useState<FlyBackState | null>(null);

  const rosterListRefs = useRef<(HTMLDivElement | null)[]>([]);

  const scheduledAt = useMemo(() => new Date(raid.scheduledAt), [raid.scheduledAt]);
  const scheduledEndAt = raid.scheduledEndAt ? new Date(raid.scheduledEndAt) : null;
  const dateShort = new Intl.DateTimeFormat(intlLocale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(scheduledAt);
  const raidTermin = formatRaidTerminLine(intlLocale, scheduledAt, scheduledEndAt);

  const totalRosterCount = useMemo(
    () => plannerGroups.reduce((n, g) => n + g.rosterOrder.length, 0),
    [plannerGroups]
  );

  const leaderLootUserOptions = useMemo(() => {
    const labelByUser = new Map<string, string>();
    for (const c of guildCharacters) {
      const u = c.userId.trim();
      if (!u) continue;
      const prev = labelByUser.get(u);
      if (!prev || c.isMain) labelByUser.set(u, c.name.trim() || u);
    }
    for (const s of signups) {
      const u = (s.userId ?? '').trim();
      if (u && !labelByUser.has(u)) labelByUser.set(u, s.name.trim() || u);
    }
    return [...labelByUser.entries()]
      .map(([userId, label]) => ({ userId, label }))
      .sort((a, b) => a.label.localeCompare(b.label, intlLocale));
  }, [guildCharacters, signups, intlLocale]);

  const poolIds = useMemo(() => {
    const placed = new Set([...allRosterIds(plannerGroups), ...reserveOrder]);
    return signups.map((s) => s.id).filter((id) => !placed.has(id));
  }, [signups, plannerGroups, reserveOrder]);

  const usedCharacterIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of signups) {
      const cid = s.characterId?.trim();
      if (cid) set.add(cid);
    }
    return set;
  }, [signups]);

  const passesPunctuality = useCallback(
    (s: RosterPlannerSignup) => punctualityFilter[punctualityOf(s)],
    [punctualityFilter]
  );

  const addCandidates = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    const all = guildCharacters.filter((c) => !usedCharacterIds.has(c.id));
    if (!q) return all.slice(0, 50);
    return all
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 50);
  }, [addQuery, guildCharacters, usedCharacterIds]);

  const addSelected = useMemo(
    () => (addSelectedId ? guildCharacters.find((c) => c.id === addSelectedId) ?? null : null),
    [addSelectedId, guildCharacters]
  );

  const passesCharFilters = useCallback(
    (s: RosterPlannerSignup) => {
      if (mainAltFilter === 'mains' && !s.isMain) return false;
      if (mainAltFilter === 'twinks' && s.isMain) return false;
      const wf = s.profileWeekFocus;
      if (wf === 'weekday' && !allowWeekday) return false;
      if (wf === 'weekend' && !allowWeekend) return false;
      if (!roleFilter[s.role]) return false;
      if (s.classId && !classFilter[s.classId]) return false;
      return true;
    },
    [mainAltFilter, allowWeekday, allowWeekend, roleFilter, classFilter]
  );

  const filteredPoolIds = useMemo(() => {
    return poolIds.filter((id) => {
      const s = byId.get(id);
      if (!s) return false;
      return passesCharFilters(s) && passesPunctuality(s);
    });
  }, [poolIds, byId, passesCharFilters, passesPunctuality]);

  const filteredReserveIds = useMemo(() => {
    return reserveOrder.filter((id) => {
      const s = byId.get(id);
      if (!s) return false;
      return passesCharFilters(s) && passesPunctuality(s);
    });
  }, [reserveOrder, byId, passesCharFilters, passesPunctuality]);

  const poolByRole = useMemo(() => {
    const m = new Map<TbcRole, string[]>();
    for (const r of ROLE_ORDER) m.set(r, []);
    for (const id of filteredPoolIds) {
      const s = byId.get(id);
      if (!s) continue;
      m.get(s.role)?.push(id);
    }
    return m;
  }, [filteredPoolIds, byId]);

  const reserveByRole = useMemo(() => {
    const m = new Map<TbcRole, string[]>();
    for (const r of ROLE_ORDER) m.set(r, []);
    for (const id of filteredReserveIds) {
      const s = byId.get(id);
      if (!s) continue;
      m.get(s.role)?.push(id);
    }
    return m;
  }, [filteredReserveIds, byId]);

  const poolRoleCounts = useMemo(() => {
    const out: Record<TbcRole, number> = { Tank: 0, Healer: 0, Melee: 0, Range: 0 };
    for (const id of filteredPoolIds) {
      const s = byId.get(id);
      if (!s) continue;
      out[s.role] += 1;
    }
    return out;
  }, [filteredPoolIds, byId]);

  const reserveRoleCounts = useMemo(() => {
    const out: Record<TbcRole, number> = { Tank: 0, Healer: 0, Melee: 0, Range: 0 };
    for (const id of filteredReserveIds) {
      const s = byId.get(id);
      if (!s) continue;
      out[s.role] += 1;
    }
    return out;
  }, [filteredReserveIds, byId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLeaderMenuOpen(false);
        setLeaderMenuPos(null);
        setOpenNote(null);
        setAddOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleRole = (r: TbcRole) => {
    setRoleFilter((prev) => {
      const next = { ...prev, [r]: !prev[r] };
      if (!ROLE_ORDER.some((x) => next[x])) return prev;
      return next;
    });
  };

  const toggleClass = (classId: string) => {
    setClassFilter((prev) => {
      const next = { ...prev, [classId]: !prev[classId] };
      if (!TBC_CLASS_IDS.some((id) => next[id])) return prev;
      return next;
    });
  };

  const togglePunctuality = (k: PlannerPunctuality) => {
    setPunctualityFilter((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      if (!next.on_time && !next.tight && !next.late) return prev;
      return next;
    });
  };

  const toggleAllowWeekday = () => setAllowWeekday((v) => (!v && !allowWeekend ? v : !v));
  const toggleAllowWeekend = () => setAllowWeekend((v) => (!v && !allowWeekday ? v : !v));

  const endDrag = useCallback(() => {
    setDragSession(null);
    setDragPoint(null);
  }, []);

  useEffect(() => {
    if (!dragSession) return;

    const sess = dragSession;
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== sess.pointerId) return;
      setDragPoint({ clientX: e.clientX, clientY: e.clientY });
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== sess.pointerId) return;
      const target = findDropTarget(e.clientX, e.clientY);
      const id = sess.signupId;
      const origin = sess.originRect;

      const applyPool = () => {
        setPlannerGroups((groups) =>
          groups.map((g) => ({ ...g, rosterOrder: g.rosterOrder.filter((x) => x !== id) }))
        );
        setReserveOrder((o) => o.filter((x) => x !== id));
      };

      if (target?.kind === 'pool') {
        applyPool();
        endDrag();
        return;
      }

      if (target?.kind === 'reserve') {
        const dragged = byId.get(id);
        if (dragged?.forbidReserve) {
          setPulseForbidReserveId(id);
          window.setTimeout(() => {
            setPulseForbidReserveId((cur) => (cur === id ? null : cur));
          }, 900);
          setFlyBack({
            signupId: id,
            fromLeft: e.clientX - sess.offsetX,
            fromTop: e.clientY - sess.offsetY,
            toLeft: origin.left,
            toTop: origin.top,
            width: origin.width,
            height: origin.height,
          });
          endDrag();
          return;
        }
        setPlannerGroups((groups) =>
          groups.map((g) => ({ ...g, rosterOrder: g.rosterOrder.filter((x) => x !== id) }))
        );
        setReserveOrder((o) => (o.includes(id) ? o : [...o, id]));
        endDrag();
        return;
      }

      if (target?.kind === 'roster') {
        const destGi = target.groupIndex;
        if (destGi < 0 || destGi >= plannerGroups.length) {
          setFlyBack({
            signupId: id,
            fromLeft: e.clientX - sess.offsetX,
            fromTop: e.clientY - sess.offsetY,
            toLeft: origin.left,
            toTop: origin.top,
            width: origin.width,
            height: origin.height,
          });
          endDrag();
          return;
        }

        const dragged = byId.get(id);
        const draggedUserId = (dragged?.userId ?? '').trim() || null;
        if (draggedUserId) {
          const groupsSans = plannerGroups.map((g) => ({
            ...g,
            rosterOrder: g.rosterOrder.filter((x) => x !== id),
          }));
          const conflictId = findUserRosterConflict(groupsSans, byId, id, draggedUserId);
          if (conflictId) {
            setBlinkDiscordForIds(setFromArray([id, conflictId]));
            window.setTimeout(() => setBlinkDiscordForIds(new Set()), 900);
            setFlyBack({
              signupId: id,
              fromLeft: e.clientX - sess.offsetX,
              fromTop: e.clientY - sess.offsetY,
              toLeft: origin.left,
              toTop: origin.top,
              width: origin.width,
              height: origin.height,
            });
            endDrag();
            return;
          }
        }

        const el = rosterListRefs.current[destGi];
        const insertAt = el ? rosterInsertIndex(el, e.clientY, id) : 0;
        setReserveOrder((o) => o.filter((x) => x !== id));
        setPlannerGroups((groups) => {
          const sans = groups.map((g) => ({
            ...g,
            rosterOrder: g.rosterOrder.filter((x) => x !== id),
          }));
          return sans.map((g, gi) => {
            if (gi !== destGi) return g;
            const next = [...g.rosterOrder];
            next.splice(insertAt, 0, id);
            return { ...g, rosterOrder: next };
          });
        });
        endDrag();
        return;
      }

      setFlyBack({
        signupId: id,
        fromLeft: e.clientX - sess.offsetX,
        fromTop: e.clientY - sess.offsetY,
        toLeft: origin.left,
        toTop: origin.top,
        width: origin.width,
        height: origin.height,
      });
      endDrag();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragSession, endDrag, byId, plannerGroups]);

  const onRowPointerDown = (
    e: React.PointerEvent,
    signupId: string,
    source: 'roster' | 'reserve' | 'pool'
  ) => {
    if (e.button !== 0) return;
    const row = (e.currentTarget as HTMLElement).closest('[data-planner-row]') as HTMLElement | null;
    if (!row) return;
    const rect = row.getBoundingClientRect();
    e.preventDefault();
    setDragSession({
      signupId,
      source,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      originRect: rect,
      pointerId: e.pointerId,
    });
    setDragPoint({ clientX: e.clientX, clientY: e.clientY });
  };

  const draggingId = dragSession?.signupId ?? null;
  const dragActive = !!dragSession;
  const flyBackRef = useRef<HTMLDivElement | null>(null);

  function effectiveSignedSpec(s: RosterPlannerSignup): string {
    return (s.signedSpec?.trim() || s.originalSignedSpec?.trim() || s.mainSpec.trim()).trim();
  }

  function renderSpecIcons(s: RosterPlannerSignup, interactive: boolean) {
    const main = s.mainSpec.trim();
    const off = (s.offSpec ?? '').trim();
    const signed = effectiveSignedSpec(s);
    const hasOff = !!off;
    const canSwitch = interactive && hasOff && !s.onlySignedSpec;
    const isOverrideActive =
      !!s.signedSpec?.trim() && !!s.originalSignedSpec?.trim() && s.signedSpec!.trim() !== s.originalSignedSpec!.trim();

    const renderOne = (spec: string) => {
      const isSigned = spec === signed;
      const gray = !isSigned;
      const redOverlay = !!s.onlySignedSpec && gray && hasOff;
      const showOverrideRing = isSigned && isOverrideActive;

      return (
        <button
          key={spec}
          type="button"
          disabled={!canSwitch || isSigned}
          onClick={() => {
            if (!canSwitch) return;
            if (spec === signed) return;
            setSignups((prev) =>
              prev.map((row) => {
                if (row.id !== s.id) return row;
                const nextRole = (roleFromSpecDisplayName(spec) ?? row.role) as TbcRole;
                return { ...row, signedSpec: spec, role: nextRole };
              })
            );
          }}
          className={cn(
            'relative inline-flex shrink-0 rounded-sm',
            canSwitch && !isSigned ? 'cursor-pointer' : 'cursor-default',
            showOverrideRing && 'ring-2 ring-green-600/70 dark:ring-green-500/70 ring-offset-1 ring-offset-background'
          )}
          title={spec}
        >
          <span className={cn(gray && 'grayscale opacity-[0.85]')}>
            <CharacterSpecIconsInline mainSpec={spec} offSpec={null} size={22} slashClassName="hidden" />
          </span>
          {redOverlay ? (
            <span
              className="pointer-events-none absolute inset-0 rounded-sm bg-red-500/35 mix-blend-multiply"
              aria-hidden
            />
          ) : null}
        </button>
      );
    };

    if (!hasOff) {
      return <span className="inline-flex items-center gap-1">{renderOne(main)}</span>;
    }
    return <span className="inline-flex items-center gap-1">{renderOne(main)}{renderOne(off)}</span>;
  }

  useLayoutEffect(() => {
    if (!flyBack) return;
    const el = flyBackRef.current;
    if (!el) return;
    const onEnd = (e: TransitionEvent) => {
      if (e.propertyName !== 'left') return;
      setFlyBack(null);
    };
    el.addEventListener('transitionend', onEnd);
    requestAnimationFrame(() => {
      el.style.transition = 'left 0.2s ease-out, top 0.2s ease-out';
      el.style.left = `${flyBack.toLeft}px`;
      el.style.top = `${flyBack.toTop}px`;
    });
    return () => el.removeEventListener('transitionend', onEnd);
  }, [flyBack]);

  function renderRow(s: RosterPlannerSignup, source: 'roster' | 'reserve' | 'pool', index?: number) {
    const isDragging = draggingId === s.id;
    const note = s.note?.trim() ?? '';
    const punct = punctualityOf(s);
    const punctLabel =
      punct === 'on_time' ? t('punctualityOnTime') : punct === 'tight' ? t('punctualityTight') : t('punctualityLate');
    return (
      <div
        key={`${source}-${s.id}`}
        role="listitem"
        data-planner-row
        data-signup-id={s.id}
        className={cn(
          'flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background px-2 py-1.5 text-sm cursor-grab active:cursor-grabbing touch-none select-none',
          isDragging && 'opacity-25'
        )}
        onPointerDown={(e) => onRowPointerDown(e, s.id, source)}
      >
        {source === 'roster' && typeof index === 'number' ? (
          <span className="tabular-nums text-muted-foreground w-10 shrink-0 font-medium inline-flex items-center gap-1">
            <span className="w-6 text-right">{index + 1}.</span>
            <RoleIcon role={s.role} size={16} />
          </span>
        ) : null}
        <CharacterMainStar
          isMain={!!s.isMain}
          titleMain={tProfile('mainLabel')}
          titleAlt={tProfile('altLabel')}
          sizePx={16}
        />
        {s.classId ? <ClassIcon classId={s.classId} size={22} /> : null}
        {renderSpecIcons(s, true)}
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="font-medium truncate">{s.name}</span>
          <CharacterSignupPunctualityMark kind={punct} label={punctLabel} />
          {s.forbidReserve ? (
            <CharacterForbidReserveBadge
              title={t('conditionForbidReserve')}
              pulse={pulseForbidReserveId === s.id}
            />
          ) : null}
        </span>
        <span className="ml-auto flex items-center gap-2">
          <CharacterDiscordPill discordName={s.discordName} blink={blinkDiscordForIds.has(s.id)} />
          <CharacterGearscorePill gearScore={s.gearScore} />
          {note.length > 0 ? (
            <button
              type="button"
              className="shrink-0 text-base leading-none opacity-80 hover:opacity-100"
              title={note}
              aria-label={t('participantNotiz')}
              onClick={(e) => {
                e.stopPropagation();
                setOpenNote({ name: s.name, note });
              }}
            >
              📒
            </button>
          ) : null}
        </span>
      </div>
    );
  }

  const draggedSignup = dragSession ? byId.get(dragSession.signupId) : null;

  function addManualSignup() {
    if (!addSelected) return;
    if (usedCharacterIds.has(addSelected.id)) return;
    const note = `Gesetzt von Raidleader ${raidLeaderLabel}`;
    const id = `manual:${addSelected.id}`;
    setSignups((prev) => {
      if (prev.some((x) => x.id === id || x.characterId === addSelected.id)) return prev;
      const row: RosterPlannerSignup = {
        id,
        userId: addSelected.userId,
        characterId: addSelected.id,
        originalCharacterId: null,
        name: addSelected.name,
        mainSpec: addSelected.mainSpec,
        offSpec: addSelected.offSpec,
        classId: addSelected.classId,
        isMain: addSelected.isMain,
        role: addSelected.role,
        signedSpec: null,
        originalSignedSpec: addSelected.mainSpec,
        onlySignedSpec: false,
        signupType: 'normal',
        leaderPlacement: 'signup',
        isLate: false,
        punctuality: 'on_time',
        forbidReserve: false,
        discordName: addSelected.guildDiscordDisplayName,
        gearScore: addSelected.gearScore,
        note,
        profileWeekFocus: null,
      };
      return [...prev, row];
    });
    setAddOpen(false);
    setAddQuery('');
    setAddSelectedId(null);
  }

  async function doCancelRaid() {
    if (!window.confirm(tEdit('cancelConfirm'))) return;
    const res = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    });
    if (!res.ok) return;
    setLeaderMenuOpen(false);
    router.push(`/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`);
    router.refresh();
  }

  async function doSaveDraft() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const rosterFlat = allRosterIds(plannerGroups);
      for (const rid of rosterFlat) {
        const row = byId.get(rid);
        const uid = (row?.userId ?? '').trim();
        if (!uid) continue;
        if (findUserRosterConflict(plannerGroups, byId, rid, uid)) {
          setSaveError(tRoster('saveErrorDiscordMultiGroup'));
          setSaving(false);
          return;
        }
      }

      const placementForId = (id: string): 'signup' | 'substitute' | 'confirmed' => {
        if (rosterFlat.includes(id)) return 'confirmed';
        if (reserveOrder.includes(id)) return 'substitute';
        return 'signup';
      };

      const idToRow = new Map(signups.map((s) => [s.id, s]));

      const mappings: Array<{ oldId: string; newId: string }> = [];

      const saveOne = async (id: string): Promise<{ oldId: string; newId: string } | null> => {
        const row = idToRow.get(id);
        if (!row) return null;
        const leaderPlacement = placementForId(id);
        const signedSpec = (row.signedSpec?.trim() || row.originalSignedSpec?.trim() || row.mainSpec.trim()).trim();
        const note = row.note ?? null;

        if (id.startsWith('manual:')) {
          const targetUserId = (row.userId ?? '').trim();
          const characterId = (row.characterId ?? '').trim();
          if (!targetUserId || !characterId) return null;
          const res = await fetch(
            `/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}/signups/leader`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                targetUserId,
                characterId,
                type: 'normal',
                signedSpec,
                leaderPlacement,
                note,
              }),
            }
          );
          if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(txt || 'Failed to create signup');
          }
          const json = (await res.json()) as { signup?: { id?: string } };
          const newId = (json.signup?.id ?? '').trim();
          if (!newId) throw new Error('Invalid create response');
          return { oldId: id, newId };
        }

        const res = await fetch(
          `/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}/signups/${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ leaderPlacement, signedSpec }),
          }
        );
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(txt || 'Failed to save');
        }
        return null;
      };

      // Execute sequentially to keep errors deterministic.
      for (const s of signups) {
        const m = await saveOne(s.id);
        if (m) mappings.push(m);
      }

      let snapshotSignups = signups;
      let snapshotGroups = plannerGroups;
      let snapshotReserve = reserveOrder;

      if (mappings.length > 0) {
        const map = new Map(mappings.map((m) => [m.oldId, m.newId]));
        snapshotSignups = signups.map((row) => {
          const nid = map.get(row.id);
          if (!nid) return row;
          return { ...row, id: nid, leaderPlacement: placementForId(row.id) };
        });
        snapshotGroups = plannerGroups.map((g) => ({
          ...g,
          rosterOrder: g.rosterOrder.map((id) => map.get(id) ?? id),
        }));
        snapshotReserve = reserveOrder.map((id) => map.get(id) ?? id);
        setSignups(snapshotSignups);
        setPlannerGroups(snapshotGroups);
        setReserveOrder(snapshotReserve);
      }

      // Persist order locally for next visit.
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          orderStorageKey,
          JSON.stringify({ groups: snapshotGroups, reserveOrder: snapshotReserve })
        );
      }

      setSavedSnapshot({
        signups: snapshotSignups,
        plannerGroups: snapshotGroups,
        reserveOrder: snapshotReserve,
      });
      setLastSavedAt(Date.now());
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function doUndoToLastSave() {
    if (!savedSnapshot) return;
    setSaveError(null);
    setSignups(savedSnapshot.signups);
    setPlannerGroups(savedSnapshot.plannerGroups);
    setReserveOrder(savedSnapshot.reserveOrder);
  }

  function doCancelToDashboard() {
    router.push(`/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`);
  }

  async function doDeleteRaid() {
    if (!window.confirm(t('deleteRaidConfirm'))) return;
    const res = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) return;
    setLeaderMenuOpen(false);
    router.push(`/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <style jsx global>{`
        @keyframes rfBlinkDiscordConflict {
          0% { background-color: rgba(239, 68, 68, 0.0); border-color: rgba(239, 68, 68, 0.0); }
          15% { background-color: rgba(239, 68, 68, 0.25); border-color: rgba(239, 68, 68, 0.65); }
          35% { background-color: rgba(239, 68, 68, 0.0); border-color: rgba(239, 68, 68, 0.0); }
          50% { background-color: rgba(239, 68, 68, 0.25); border-color: rgba(239, 68, 68, 0.65); }
          70% { background-color: rgba(239, 68, 68, 0.0); border-color: rgba(239, 68, 68, 0.0); }
          100% { background-color: rgba(239, 68, 68, 0.0); border-color: rgba(239, 68, 68, 0.0); }
        }
        .rf-blink-discord-conflict {
          animation: rfBlinkDiscordConflict 0.8s ease-in-out 1;
        }
        @keyframes rfPulseForbidReserve {
          0% { transform: scale(1); filter: brightness(1); }
          25% { transform: scale(1.2); filter: brightness(1.15); }
          50% { transform: scale(1); filter: brightness(1); }
          75% { transform: scale(1.15); filter: brightness(1.1); }
          100% { transform: scale(1); filter: brightness(1); }
        }
        .rf-pulse-forbid-reserve {
          animation: rfPulseForbidReserve 0.85s ease-in-out 1;
        }
      `}</style>
      <header
        className={cn(
          'flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-border pb-5 transition-opacity duration-200',
          dragActive && 'opacity-35 pointer-events-none'
        )}
      >
        <div className="min-w-0 space-y-1 flex-1">
          <p className="text-sm text-muted-foreground">
            {raid.dungeonLabel} · {raid.guildName} · {dateShort}
          </p>
          <div className="flex items-start gap-2">
            <h1 className="text-2xl font-bold text-foreground tracking-tight min-w-0 flex-1">{raid.name}</h1>
            <button
              type="button"
              className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background hover:bg-muted"
              aria-label={t('raidLeaderMenu')}
              title={t('raidLeaderMenu')}
              onClick={(e) => {
                e.stopPropagation();
                const pos = openMenuAtButton(e.currentTarget);
                setLeaderMenuPos(pos);
                setLeaderMenuOpen((o) => !o);
              }}
            >
              <span className="text-lg leading-none">☰</span>
            </button>
          </div>
          <p className="text-base text-foreground/90">
            <span className="text-muted-foreground">{t('raidSlotLabel')}:</span> {raidTermin}
          </p>
          <p className="text-xs text-muted-foreground">{tRoster('draftHint')}</p>
        </div>
      </header>

      <section
        className={cn(
          'rounded-xl border border-border bg-card/40 shadow-sm overflow-hidden transition-opacity duration-200',
          dragActive && 'opacity-35 pointer-events-none'
        )}
      >
        <div className="flex flex-col gap-3 border-b border-border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <h2 className="text-sm font-semibold text-foreground shrink-0">{t('sectionOverview')}</h2>
          <RaidOverviewSummaryRows {...overviewProps} />
        </div>
      </section>

      <section
        aria-label={tRoster('actions')}
        className={cn(
          'rounded-xl border border-border bg-card/40 shadow-sm px-4 py-3 transition-opacity duration-200',
          dragActive && 'opacity-35 pointer-events-none'
        )}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void doSaveDraft()}
              disabled={saving}
              className={cn(
                'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                'border-emerald-600/60 text-emerald-700 hover:bg-emerald-50',
                'dark:border-emerald-400/60 dark:text-emerald-400 dark:hover:bg-emerald-950/30',
                saving && 'opacity-60 cursor-not-allowed'
              )}
              title={tRoster('save')}
            >
              {tRoster('save')}
            </button>

            <button
              type="button"
              onClick={doUndoToLastSave}
              disabled={!savedSnapshot || saving}
              className={cn(
                'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                'border-amber-600/60 text-amber-700 hover:bg-amber-50',
                'dark:border-amber-400/70 dark:text-amber-400 dark:hover:bg-amber-950/30',
                (!savedSnapshot || saving) && 'opacity-60 cursor-not-allowed'
              )}
              title={tRoster('undo')}
            >
              {tRoster('undo')}
            </button>

            <button
              type="button"
              onClick={doCancelToDashboard}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground/90 hover:bg-muted transition-colors"
              title={tRoster('cancel')}
            >
              {tRoster('cancel')}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => {
                // Dummy for now; logic will be delivered later.
                window.alert(tRoster('announceSoon'));
              }}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                'bg-emerald-600 text-white hover:bg-emerald-700',
                'dark:bg-emerald-500 dark:hover:bg-emerald-600'
              )}
              title={tRoster('announce')}
            >
              {tRoster('announce')}
            </button>

            <button
              type="button"
              onClick={() => void doCancelRaid()}
              disabled={saving}
              className={cn(
                'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                'border-red-600/60 text-red-700 hover:bg-red-50',
                'dark:border-red-400/70 dark:text-red-400 dark:hover:bg-red-950/30',
                saving && 'opacity-60 cursor-not-allowed'
              )}
              title={t('menuCancelRaid')}
            >
              {t('menuCancelRaid')}
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-col gap-1">
          {saveError ? (
            <p className="text-xs text-destructive" role="status">
              {saveError}
            </p>
          ) : null}
          {lastSavedAt ? (
            <p className="text-xs text-muted-foreground" role="status">
              {tRoster('savedAt', { ts: new Date(lastSavedAt).toLocaleTimeString(intlLocale) })}
            </p>
          ) : null}
        </div>
      </section>

      <div className="flex flex-col xl:flex-row gap-4 items-start">
        <div className="flex-1 min-w-0 grid grid-cols-1 lg:grid-cols-2 gap-4 w-full order-2 xl:order-1">
          <div className="space-y-4 min-w-0">
            {plannerGroups.length > 1 ? (
              <p className="text-xs text-muted-foreground px-1">
                {tRoster('rosterTotalHint', { current: totalRosterCount, max: raid.maxPlayers })}
              </p>
            ) : null}

            {plannerGroups.map((group, groupIndex) => {
              const gRatio = rosterMinFulfillmentRatioForOrder(group.rosterOrder, byId, overviewProps);
              const gRoleCounts = roleCountsForRosterOrder(group.rosterOrder, byId);
              const gSpecCounts = minSpecKeyCountsForRosterOrder(
                group.rosterOrder,
                byId,
                overviewProps.minSpecsObj
              );
              const rlUid = group.raidLeaderUserId;
              const lmUid = group.lootmasterUserId;
              const rlInRoster =
                !!rlUid &&
                group.rosterOrder.some((sid) => (byId.get(sid)?.userId ?? '').trim() === rlUid);
              const lmInRoster =
                !!lmUid &&
                group.rosterOrder.some((sid) => (byId.get(sid)?.userId ?? '').trim() === lmUid);

              return (
                <div
                  key={`roster-group-${groupIndex}`}
                  data-drop-zone="roster"
                  data-roster-group={String(groupIndex)}
                  className={cn(
                    'rounded-xl border border-border bg-card/40 shadow-sm overflow-hidden min-h-[120px] transition-[box-shadow] duration-200',
                    dragActive && 'ring-2 ring-primary/45 ring-offset-2 ring-offset-background'
                  )}
                >
                  <div className="border-b border-border bg-muted/20 px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <h2 className="text-sm font-semibold text-foreground">
                        {tRoster('groupTitle', { n: groupIndex + 1 })}
                      </h2>
                      <div className={cn('text-lg font-bold tabular-nums leading-none', toneForFulfillment(gRatio))}>
                        {group.rosterOrder.length} / {raid.maxPlayers}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="text-muted-foreground">{tPlanner('raidLeader')}</span>
                        <select
                          className={cn(
                            'rounded-md border bg-background px-2 py-1.5 text-sm',
                            !rlUid
                              ? 'border-input'
                              : rlInRoster
                                ? 'border-green-600/70 dark:border-green-500/60'
                                : 'border-amber-600/60 dark:border-amber-500/50'
                          )}
                          value={rlUid ?? ''}
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            setPlannerGroups((prev) =>
                              prev.map((g, i) =>
                                i === groupIndex ? { ...g, raidLeaderUserId: v || null } : g
                              )
                            );
                          }}
                        >
                          <option value="">{tPlanner('lootmasterNone')}</option>
                          {leaderLootUserOptions.map((o) => (
                            <option key={`${groupIndex}-rl-${o.userId}`} value={o.userId}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        {rlUid ? (
                          <span
                            className={cn(
                              'text-[11px] leading-tight',
                              rlInRoster ? 'text-green-700 dark:text-green-400' : 'text-amber-800 dark:text-amber-400'
                            )}
                          >
                            {rlInRoster ? tRoster('roleInRoster') : tRoster('roleNotInRoster')}
                          </span>
                        ) : null}
                      </label>
                      <label className="flex flex-col gap-1 text-xs">
                        <span className="text-muted-foreground">{tPlanner('lootmaster')}</span>
                        <select
                          className={cn(
                            'rounded-md border bg-background px-2 py-1.5 text-sm',
                            !lmUid
                              ? 'border-input'
                              : lmInRoster
                                ? 'border-green-600/70 dark:border-green-500/60'
                                : 'border-amber-600/60 dark:border-amber-500/50'
                          )}
                          value={lmUid ?? ''}
                          onChange={(e) => {
                            const v = e.target.value.trim();
                            setPlannerGroups((prev) =>
                              prev.map((g, i) =>
                                i === groupIndex ? { ...g, lootmasterUserId: v || null } : g
                              )
                            );
                          }}
                        >
                          <option value="">{tPlanner('lootmasterNone')}</option>
                          {leaderLootUserOptions.map((o) => (
                            <option key={`${groupIndex}-lm-${o.userId}`} value={o.userId}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        {lmUid ? (
                          <span
                            className={cn(
                              'text-[11px] leading-tight',
                              lmInRoster ? 'text-green-700 dark:text-green-400' : 'text-amber-800 dark:text-amber-400'
                            )}
                          >
                            {lmInRoster ? tRoster('roleInRoster') : tRoster('roleNotInRoster')}
                          </span>
                        ) : null}
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                      {ROLE_KEYS.map((roleKey) => {
                        const need = overviewProps.roleMinByKey[roleKey] ?? 0;
                        if (need <= 0) return null;
                        const cur = gRoleCounts[roleKey] ?? 0;
                        return (
                          <span key={roleKey} className="inline-flex items-center gap-1.5">
                            <RoleIcon role={roleKey} size={16} />
                            <span className={cn('font-semibold tabular-nums', cur < need ? 'text-destructive' : 'text-foreground')}>
                              {countToMinLabel(cur, need)}
                            </span>
                          </span>
                        );
                      })}

                      {overviewProps.minSpecsObj
                        ? Object.entries(overviewProps.minSpecsObj)
                            .filter(([, need]) => typeof need === 'number' && need > 0)
                            .map(([specKey, need]) => {
                              const cur = gSpecCounts.get(specKey) ?? 0;
                              const classId = parseMinSpecClassKey(specKey);
                              const title = minSpecKeyTitle(specKey, tProfile);
                              return (
                                <span key={specKey} className="inline-flex items-center gap-1.5" title={title}>
                                  {classId ? (
                                    <ClassIcon classId={classId} size={16} title={title} />
                                  ) : (
                                    <SpecIcon spec={specKey} size={16} />
                                  )}
                                  <span className={cn('font-semibold tabular-nums', cur < need ? 'text-destructive' : 'text-foreground')}>
                                    {countToMinLabel(cur, need)}
                                  </span>
                                </span>
                              );
                            })
                        : null}
                    </div>
                  </div>
                  <div
                    ref={(el) => {
                      rosterListRefs.current[groupIndex] = el;
                    }}
                    className="p-3 space-y-2"
                    role="list"
                  >
                    {group.rosterOrder.length === 0 ? (
                      <p className="text-sm text-muted-foreground px-1 py-4 text-center">{tRoster('rosterEmpty')}</p>
                    ) : (
                      group.rosterOrder.map((id, i) => {
                        const s = byId.get(id);
                        if (!s) return null;
                        return renderRow(s, 'roster', i);
                      })
                    )}
                  </div>
                </div>
              );
            })}

            <button
              type="button"
              onClick={() =>
                setPlannerGroups((prev) => [
                  ...prev,
                  {
                    rosterOrder: [],
                    raidLeaderUserId: initialRaidLeaderUserId,
                    lootmasterUserId: initialLootmasterUserId,
                  },
                ])
              }
              className="w-full rounded-lg border border-dashed border-border bg-muted/10 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/30 transition-colors"
            >
              {tRoster('addGroup')}
            </button>

            <div
              data-drop-zone="reserve"
              className={cn(
                'rounded-xl border border-border bg-card/40 shadow-sm overflow-hidden min-h-[100px] transition-[box-shadow] duration-200',
                dragActive && 'ring-2 ring-primary/45 ring-offset-2 ring-offset-background'
              )}
            >
              <div className="border-b border-border bg-muted/20 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-foreground">{tRoster('reserveTitle')}</h2>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                    {ROLE_ORDER.map((r) => (
                      <span key={r} className="inline-flex items-center gap-1">
                        <RoleIcon role={r} size={14} />
                        <span className="font-semibold">{reserveRoleCounts[r] ?? 0}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-3 space-y-3" role="list">
                {ROLE_ORDER.map((role) => {
                  const ids = reserveByRole.get(role) ?? [];
                  if (ids.length === 0) return null;
                  return (
                    <div key={role}>
                      <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted-foreground">
                        <RoleIcon role={role} size={16} />
                        <span>{role}</span>
                      </div>
                      <div className="space-y-2 pl-1">
                        {ids.map((id) => {
                          const s = byId.get(id);
                          if (!s) return null;
                          return renderRow(s, 'reserve');
                        })}
                      </div>
                    </div>
                  );
                })}
                {filteredReserveIds.length === 0 && reserveOrder.length > 0 ? (
                  <p className="text-sm text-muted-foreground px-1 py-2">{tRoster('reserveFilteredEmpty')}</p>
                ) : null}
                {reserveOrder.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-1 py-2">{tRoster('reserveEmpty')}</p>
                ) : null}
              </div>
            </div>
          </div>

          <div
            data-drop-zone="pool"
            className={cn(
              'rounded-xl border border-border bg-card/40 shadow-sm overflow-hidden min-h-[200px] transition-[box-shadow] duration-200',
              dragActive && 'ring-2 ring-primary/45 ring-offset-2 ring-offset-background'
            )}
          >
            <div className="border-b border-border bg-muted/20 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-foreground">{tRoster('signupsTitle')}</h2>
                <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                  {ROLE_ORDER.map((r) => (
                    <span key={r} className="inline-flex items-center gap-1">
                      <RoleIcon role={r} size={14} />
                      <span className="font-semibold">{poolRoleCounts[r] ?? 0}</span>
                    </span>
                  ))}
                </div>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-muted shrink-0"
                  aria-label={tPlanner('add')}
                  title={tPlanner('add')}
                  onClick={() => setAddOpen(true)}
                >
                  ➕
                </button>
              </div>
            </div>
            <div className="p-3 space-y-4 max-h-[min(70vh,720px)] overflow-y-auto">
              {ROLE_ORDER.map((role) => {
                const ids = poolByRole.get(role) ?? [];
                if (ids.length === 0) return null;
                return (
                  <div key={role}>
                    <div className="flex items-center gap-2 mb-2 text-xs font-medium text-muted-foreground">
                      <RoleIcon role={role} size={16} />
                      <span>{role}</span>
                    </div>
                    <div className="space-y-2 pl-1" role="list">
                      {ids.map((id) => {
                        const s = byId.get(id);
                        if (!s) return null;
                        return renderRow(s, 'pool');
                      })}
                    </div>
                  </div>
                );
              })}
              {filteredPoolIds.length === 0 && poolIds.length > 0 ? (
                <p className="text-sm text-muted-foreground">{tRoster('poolFilteredEmpty')}</p>
              ) : null}
              {poolIds.length === 0 ? (
                <p className="text-sm text-muted-foreground">{tRoster('poolEmpty')}</p>
              ) : null}
            </div>
          </div>
        </div>

        <aside
          className={cn(
            'shrink-0 flex flex-col gap-3 transition-opacity duration-200 order-1 xl:order-2 xl:sticky xl:top-4',
            dragActive && 'opacity-35 pointer-events-none'
          )}
        >
          {filtersOpen ? (
            <div className="w-full xl:w-72 rounded-xl border border-border bg-muted/15 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                <p className="text-sm font-medium">{tPlanner('filters')}</p>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
                  aria-label={tPlanner('filters')}
                >
                  ◀
                </button>
              </div>

              <div className="space-y-1.5">
                <span className="text-muted-foreground text-xs">{tPlanner('filterChars')}</span>
                <div className="flex rounded-lg border border-border p-0.5 bg-muted/30">
                  {(
                    [
                      ['mains', tPlanner('filterCharsMains')],
                      ['both', tPlanner('filterCharsBoth')],
                      ['twinks', tPlanner('filterCharsTwinks')],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setMainAltFilter(v)}
                      className={cn(
                        'rounded-md px-2.5 py-1.5 text-sm flex-1',
                        mainAltFilter === v
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-muted-foreground text-xs">{tPlanner('filterDays')}</span>
                <div className="flex rounded-lg border border-border p-0.5 bg-muted/30">
                  <button
                    type="button"
                    onClick={toggleAllowWeekday}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm flex-1',
                      allowWeekday ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                    )}
                    aria-pressed={allowWeekday}
                  >
                    {tPlanner('focusWeekday')}
                  </button>
                  <button
                    type="button"
                    onClick={toggleAllowWeekend}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm flex-1',
                      allowWeekend ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                    )}
                    aria-pressed={allowWeekend}
                  >
                    {tPlanner('focusWeekend')}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-muted-foreground text-xs">{tPlanner('filterRoles')}</span>
                <div className="grid grid-cols-2 gap-2">
                  {ROLE_ORDER.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggleRole(r)}
                      className={cn(
                        'rounded-lg border px-2 py-1.5 text-sm flex items-center gap-2 justify-start',
                        roleFilter[r]
                          ? 'border-primary/50 bg-primary/10 text-foreground'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                      )}
                      aria-pressed={roleFilter[r]}
                    >
                      <RoleIcon role={r} size={18} />
                      <span>{r}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-muted-foreground text-xs">{tPlanner('filterClasses')}</span>
                <div className="grid grid-cols-3 gap-2">
                  {TBC_CLASS_IDS.map((classId) => (
                    <button
                      key={classId}
                      type="button"
                      onClick={() => toggleClass(classId)}
                      className={cn(
                        'rounded-lg border px-2 py-1.5 text-sm flex items-center gap-2 justify-start min-w-0',
                        classFilter[classId]
                          ? 'border-primary/50 bg-primary/10 text-foreground'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                      )}
                      aria-pressed={!!classFilter[classId]}
                      title={tPlanner(RAID_PLANNER_CLASS_I18N[classId as keyof typeof RAID_PLANNER_CLASS_I18N])}
                    >
                      <ClassIcon classId={classId} size={18} />
                      <span className="truncate">
                        {tPlanner(RAID_PLANNER_CLASS_I18N[classId as keyof typeof RAID_PLANNER_CLASS_I18N])}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <span className="text-muted-foreground text-xs">{tRoster('filterPunctuality')}</span>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['on_time', tRoster('punctualityFilterOnTime'), '🟢'] as const,
                      ['tight', tRoster('punctualityFilterTight'), '🟡'] as const,
                      ['late', tRoster('punctualityFilterLate'), '🕒'] as const,
                    ] as const
                  ).map(([k, label, icon]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => togglePunctuality(k)}
                      className={cn(
                        'rounded-lg border px-2 py-1.5 text-xs sm:text-sm flex items-center gap-1.5 justify-start min-w-0',
                        punctualityFilter[k]
                          ? 'border-primary/50 bg-primary/10 text-foreground'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                      )}
                      aria-pressed={punctualityFilter[k]}
                      title={label}
                    >
                      <span className="shrink-0" aria-hidden>
                        {icon}
                      </span>
                      <span className="truncate">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="w-full xl:w-10 rounded-xl border border-border bg-muted/15 py-4 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/25"
              aria-label={tPlanner('filters')}
              title={tPlanner('filters')}
            >
              <span className="block xl:[writing-mode:vertical-rl] xl:rotate-180">
                {tPlanner('filters')}
              </span>
            </button>
          )}

          {raidOptionsOpen ? (
            <div className="w-full xl:w-72 rounded-xl border border-border bg-muted/15 p-4 space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                <p className="text-sm font-medium">{tPlanner('raidOptions')}</p>
                <button
                  type="button"
                  onClick={() => setRaidOptionsOpen(false)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
                  aria-label={tPlanner('raidOptions')}
                >
                  ◀
                </button>
              </div>

              <div className="space-y-1.5">
                <span className="text-muted-foreground text-xs">{tPlanner('raidOptionsUnsetPlayers')}</span>
                <div className="flex rounded-lg border border-border p-0.5 bg-muted/30">
                  <button
                    type="button"
                    onClick={() => setUnsetPlayersMode('reserve')}
                    className={cn(
                      'rounded-md px-2.5 py-1.5 text-sm flex-1',
                      unsetPlayersMode === 'reserve'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    )}
                    aria-pressed={unsetPlayersMode === 'reserve'}
                  >
                    {tPlanner('raidOptionsUnsetReserve')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setUnsetPlayersMode('decline')}
                    className={cn(
                      'rounded-md px-2.5 py-1.5 text-sm flex-1',
                      unsetPlayersMode === 'decline'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    )}
                    aria-pressed={unsetPlayersMode === 'decline'}
                  >
                    {tPlanner('raidOptionsUnsetDecline')}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-muted-foreground text-xs">{tPlanner('raidOptionsBotNotify')}</span>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['roster', tPlanner('raidOptionsBotNotifyRoster')] as const,
                      ['reserve', tPlanner('raidOptionsBotNotifyReserve')] as const,
                      ['decline', tPlanner('raidOptionsBotNotifyDecline')] as const,
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() =>
                        setBotNotifyTargets((prev) => ({ ...prev, [k]: !prev[k] }))
                      }
                      className={cn(
                        'rounded-lg border px-2 py-1.5 text-xs sm:text-sm flex items-center justify-center min-w-0',
                        botNotifyTargets[k]
                          ? 'border-primary/50 bg-primary/10 text-foreground'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                      )}
                      aria-pressed={botNotifyTargets[k]}
                    >
                      <span className="truncate">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-muted-foreground text-xs">{tPlanner('raidOptionsNotifyChanges')}</span>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      ['channel', tPlanner('raidOptionsNotifyChannel')] as const,
                      ['leader', tPlanner('raidOptionsNotifyLeader')] as const,
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() =>
                        setChangeNotifyTargets((prev) => ({ ...prev, [k]: !prev[k] }))
                      }
                      className={cn(
                        'rounded-lg border px-2 py-1.5 text-xs sm:text-sm flex items-center justify-center min-w-0',
                        changeNotifyTargets[k]
                          ? 'border-primary/50 bg-primary/10 text-foreground'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                      )}
                      aria-pressed={changeNotifyTargets[k]}
                    >
                      <span className="truncate">{label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRaidOptionsOpen(true)}
              className="w-full xl:w-10 rounded-xl border border-border bg-muted/15 py-4 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/25"
              aria-label={tPlanner('raidOptions')}
              title={tPlanner('raidOptions')}
            >
              <span className="block xl:[writing-mode:vertical-rl] xl:rotate-180">
                {tPlanner('raidOptions')}
              </span>
            </button>
          )}
        </aside>
      </div>

      {leaderMenuOpen && leaderMenuPos
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-[995] bg-black/20"
                onMouseDown={() => setLeaderMenuOpen(false)}
              />
              <div
                className="fixed z-[1000] w-52 rounded-md border border-border bg-background shadow-lg overflow-hidden"
                style={{ top: leaderMenuPos.top, left: leaderMenuPos.left }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted"
                  onClick={() => {
                    setLeaderMenuOpen(false);
                    router.push(`/${locale}/guild/${guildId}/raid/${raidId}`);
                  }}
                >
                  {tRoster('menuRaidView')}
                </button>
                <button
                  type="button"
                  disabled={!canEditRaid}
                  title={!canEditRaid ? t('raidEditClosed') : undefined}
                  className={cn(
                    'w-full text-left px-3 py-2.5 text-sm hover:bg-muted',
                    !canEditRaid && 'opacity-50 cursor-not-allowed'
                  )}
                  onClick={() => {
                    setLeaderMenuOpen(false);
                    if (canEditRaid) router.push(`/${locale}/guild/${guildId}/raid/${raidId}/edit`);
                  }}
                >
                  ✏️ {t('modeEdit')}
                </button>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted"
                  onClick={() => {
                    setLeaderMenuOpen(false);
                    void doCancelRaid();
                  }}
                >
                  🚫 {t('menuCancelRaid')}
                </button>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    setLeaderMenuOpen(false);
                    void doDeleteRaid();
                  }}
                >
                  🗑️ {t('menuDeleteRaid')}
                </button>
              </div>
            </>,
            document.body
          )
        : null}

      {openNote
        ? createPortal(
            <div className="fixed inset-0 z-[1210]">
              <div
                className="absolute inset-0 bg-black/50"
                onMouseDown={() => setOpenNote(null)}
                role="button"
                tabIndex={0}
                aria-label="Close"
              />
              <div className="absolute inset-0 flex items-start justify-center p-4 sm:p-6">
                <div
                  className="w-full max-w-lg rounded-xl border border-border bg-background shadow-xl overflow-hidden"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="border-b border-border bg-muted/20 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{openNote.name}</p>
                      <p className="text-xs text-muted-foreground">{t('participantNotiz')}</p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-muted shrink-0"
                      onClick={() => setOpenNote(null)}
                      aria-label={tPlanner('cancel')}
                      title={tPlanner('cancel')}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="p-4">
                    <div className="rounded-lg border border-border bg-muted/15 p-3 text-sm whitespace-pre-wrap">
                      {openNote.note}
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {dragSession && dragPoint && draggedSignup
        ? createPortal(
            <div
              className="pointer-events-none fixed z-[1100] rounded-lg border border-primary bg-background px-2 py-1.5 text-sm shadow-xl flex flex-wrap items-center gap-2"
              style={{
                left: dragPoint.clientX - dragSession.offsetX,
                top: dragPoint.clientY - dragSession.offsetY,
                width: dragSession.originRect.width,
                minHeight: dragSession.originRect.height,
              }}
            >
              <CharacterMainStar
                isMain={!!draggedSignup.isMain}
                titleMain={tProfile('mainLabel')}
                titleAlt={tProfile('altLabel')}
                sizePx={16}
              />
              {draggedSignup.classId ? <ClassIcon classId={draggedSignup.classId} size={22} /> : null}
              {renderSpecIcons(draggedSignup, false)}
              <span className="font-medium truncate inline-flex items-center gap-1">
                {draggedSignup.name}
                <CharacterSignupPunctualityMark
                  kind={punctualityOf(draggedSignup)}
                  label={
                    punctualityOf(draggedSignup) === 'on_time'
                      ? t('punctualityOnTime')
                      : punctualityOf(draggedSignup) === 'tight'
                        ? t('punctualityTight')
                        : t('punctualityLate')
                  }
                />
              </span>
            </div>,
            document.body
          )
        : null}

      {flyBack && byId.get(flyBack.signupId)
        ? createPortal(
            <div
              ref={flyBackRef}
              className="fixed z-[1100] pointer-events-none rounded-lg border border-border bg-background shadow-lg flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm"
              style={{
                left: flyBack.fromLeft,
                top: flyBack.fromTop,
                width: flyBack.width,
                minHeight: flyBack.height,
              }}
            >
              {(() => {
                const s = byId.get(flyBack.signupId)!;
                return (
                  <>
                    <CharacterMainStar
                      isMain={!!s.isMain}
                      titleMain={tProfile('mainLabel')}
                      titleAlt={tProfile('altLabel')}
                      sizePx={16}
                    />
                    {s.classId ? <ClassIcon classId={s.classId} size={22} /> : null}
                    {renderSpecIcons(s, false)}
                    <span className="font-medium truncate inline-flex items-center gap-1">
                      {s.name}
                      <CharacterSignupPunctualityMark
                        kind={punctualityOf(s)}
                        label={
                          punctualityOf(s) === 'on_time'
                            ? t('punctualityOnTime')
                            : punctualityOf(s) === 'tight'
                              ? t('punctualityTight')
                              : t('punctualityLate')
                        }
                      />
                    </span>
                  </>
                );
              })()}
            </div>,
            document.body
          )
        : null}

      {addOpen
        ? createPortal(
            <div className="fixed inset-0 z-[1200]">
              <div
                className="absolute inset-0 bg-black/50"
                onMouseDown={() => setAddOpen(false)}
                role="button"
                tabIndex={0}
                aria-label="Close"
              />
              <div className="absolute inset-0 flex items-start justify-center p-4 sm:p-6">
                <div
                  className="w-full max-w-lg rounded-xl border border-border bg-background shadow-xl overflow-hidden"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="border-b border-border bg-muted/20 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{tPlanner('addPlayer')}</p>
                      <p className="text-xs text-muted-foreground">{tRoster('addHint')}</p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-muted shrink-0"
                      onClick={() => setAddOpen(false)}
                      aria-label={tPlanner('cancel')}
                      title={tPlanner('cancel')}
                    >
                      ✕
                    </button>
                  </div>

                  <div className="p-4 space-y-3">
                    <input
                      value={addQuery}
                      onChange={(e) => {
                        setAddQuery(e.target.value);
                        setAddSelectedId(null);
                      }}
                      placeholder={tPlanner('pickChar')}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      autoFocus
                    />

                    <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                      {addCandidates.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">{tRoster('noResults')}</p>
                      ) : (
                        <div className="divide-y divide-border">
                          {addCandidates.map((c) => {
                            const selected = addSelectedId === c.id;
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => setAddSelectedId(c.id)}
                                className={cn(
                                  'w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2',
                                  selected && 'bg-primary/10'
                                )}
                              >
                                <CharacterMainStar
                                  isMain={!!c.isMain}
                                  titleMain={tProfile('mainLabel')}
                                  titleAlt={tProfile('altLabel')}
                                  sizePx={14}
                                />
                                {c.classId ? <ClassIcon classId={c.classId} size={18} /> : null}
                                <span className="flex items-center gap-1.5">
                                  <CharacterSpecIconsInline
                                    mainSpec={c.mainSpec}
                                    offSpec={c.offSpec}
                                    size={18}
                                    slashClassName="hidden"
                                    offSpecWrapperBaseClassName=""
                                    offSpecIconClassName="grayscale contrast-200 brightness-75"
                                  />
                                </span>
                                <span className="font-medium truncate">{c.name}</span>
                                <span className="ml-auto flex items-center gap-2">
                                  <CharacterDiscordPill discordName={c.guildDiscordDisplayName} />
                                  <CharacterGearscorePill gearScore={c.gearScore} />
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
                        onClick={() => setAddOpen(false)}
                      >
                        {tPlanner('cancel')}
                      </button>
                      <button
                        type="button"
                        disabled={!addSelected}
                        className={cn(
                          'rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground',
                          !addSelected && 'opacity-50 cursor-not-allowed'
                        )}
                        onClick={addManualSignup}
                      >
                        {tPlanner('add')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
