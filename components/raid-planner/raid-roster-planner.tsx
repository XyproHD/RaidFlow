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
import { PlannerLeaderNotesCollapsible } from '@/components/raid-planner/planner-leader-notes-collapsible';
import { GroupCharNamesExport } from '@/components/raid-planner/group-char-names-export';
import { sanitizePlannerLeaderHtml } from '@/lib/sanitize-planner-html';
import type { AnnounceRaidPayload } from '@/lib/raid-announce';
import {
  applyPlannerUnsetPolicy,
  leaderPlacementForPlannerSlot,
  type UnsetPlayersMode,
} from '@/lib/planner-unset-policy';
import { formatSignupApiErrorPayload } from '@/lib/raid-signup-api-errors';
import { orderedReserveSignupIdsForDisplay } from '@/lib/planner-reserve-order';
import { formatDefaultRaidCancelDmDe } from '@/lib/raid-cancel-message';
import { RaidCancelDiscordOverlay } from '@/components/raid-cancel-discord-overlay';
import { PlannerPartyInline } from '@/components/raid-planner/planner-party-grid';
import {
  applyPartyLayoutToGroup,
  findFirstEmptyPartyCell,
  parsePartySlotsFromStored,
  rosterOrderFromPartySlots,
  setPartyCell,
  stripSignupIdsFromPlannerGroups,
  syncPartySlotsForGroup,
} from '@/lib/planner-party-slots';
import type { ComparisonPlacement } from '@/lib/planner-comparison';

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

type QuickDropTarget = 'decline' | 'pool' | 'reserve';

type DragSession = {
  signupId: string;
  source: 'roster' | 'reserve' | 'pool' | 'party';
  offsetX: number;
  offsetY: number;
  originRect: DOMRect;
  pointerId: number;
  startClientX: number;
  startClientY: number;
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
  partySlots: string[][];
};

type DropTarget =
  | { kind: 'roster'; groupIndex: number }
  | { kind: 'party'; groupIndex: number; partyIndex: number; cellIndex?: number }
  | { kind: 'decline' }
  | { kind: 'reserve' }
  | { kind: 'pool' };

function findQuickDropTarget(x: number, y: number): QuickDropTarget | null {
  const stack = document.elementsFromPoint(x, y);
  for (const el of stack) {
    if (!(el instanceof HTMLElement)) continue;
    const q = el.dataset.quickDrop;
    if (q === 'decline' || q === 'pool' || q === 'reserve') return q;
  }
  return null;
}

function findDropTarget(x: number, y: number): DropTarget | null {
  const stack = document.elementsFromPoint(x, y);
  for (const el of stack) {
    if (!(el instanceof HTMLElement)) continue;
    const z = el.dataset.dropZone;
    if (z === 'pool') return { kind: 'pool' };
    if (z === 'decline') return { kind: 'decline' };
    if (z === 'reserve') return { kind: 'reserve' };
    if (z === 'roster') {
      const raw = el.dataset.rosterGroup ?? '0';
      const gi = Number.parseInt(raw, 10);
      return { kind: 'roster', groupIndex: Number.isFinite(gi) && gi >= 0 ? gi : 0 };
    }
    if (z === 'party') {
      const gi = Number.parseInt(el.dataset.rosterGroup ?? '0', 10);
      const pi = Number.parseInt(el.dataset.partyIndex ?? '0', 10);
      const cellRaw = el.dataset.partyCell;
      const cellIndex =
        cellRaw != null ? Number.parseInt(cellRaw, 10) : undefined;
      if (!Number.isFinite(gi) || gi < 0 || !Number.isFinite(pi) || pi < 0) continue;
      return {
        kind: 'party',
        groupIndex: gi,
        partyIndex: pi,
        cellIndex: Number.isFinite(cellIndex) ? cellIndex : undefined,
      };
    }
  }
  return null;
}

function allRosterIds(groups: PlannerGroup[]): string[] {
  return groups.flatMap((g) => rosterOrderFromPartySlots(g.partySlots));
}

function findUserRosterConflict(
  groups: PlannerGroup[],
  byId: Map<string, RosterPlannerSignup>,
  draggingId: string,
  userId: string
): string | null {
  for (const g of groups) {
    for (const otherId of rosterOrderFromPartySlots(g.partySlots)) {
      if (otherId === draggingId) continue;
      const other = byId.get(otherId);
      if ((other?.userId ?? '').trim() === userId) return otherId;
    }
  }
  return null;
}

function dedupePartySlotsAcrossGroups(groups: PlannerGroup[], maxPlayers: number): PlannerGroup[] {
  const seen = new Set<string>();
  return groups.map((g) => {
    const slots = syncPartySlotsForGroup(g, maxPlayers).map((row) =>
      row.map((id) => {
        if (!id || seen.has(id)) return '';
        seen.add(id);
        return id;
      })
    );
    return applyPartyLayoutToGroup({ ...g, partySlots: slots }, maxPlayers);
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

function attendanceRowVariant(s: RosterPlannerSignup): 'default' | 'uncertain' | 'declined' {
  const tn = typeNorm(s.signupType);
  if (tn === 'uncertain') return 'uncertain';
  if (tn === 'declined') return 'declined';
  return 'default';
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

function minCountTone(count: number, min: number) {
  if (min <= 0) return 'text-green-600 dark:text-green-500';
  return count < min ? 'text-destructive' : 'text-green-600 dark:text-green-500';
}

function comparisonRowClass(placement: ComparisonPlacement | null, enabled: boolean) {
  if (!enabled || !placement) return '';
  if (placement === 'confirmed') return 'ring-2 ring-emerald-500/70 bg-emerald-500/[0.08]';
  if (placement === 'reserve') return 'ring-2 ring-amber-500/70 bg-amber-500/[0.08]';
  if (placement === 'uncertain') return 'ring-2 ring-violet-500/60 bg-violet-500/[0.08]';
  return 'ring-2 ring-sky-500/60 bg-sky-500/[0.07]';
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

export function RaidRosterPlanner({
  locale,
  guildId,
  raidId,
  raid,
  overviewProps,
  initialSignups,
  guildCharacters,
  raidLeaderLabel,
  organizerLabel,
  canEditRaid,
  initialPlannerLeaderNotesHtml,
  raidStatus,
  persistedServerPlannerOrder = null,
}: {
  locale: string;
  guildId: string;
  raidId: string;
  raid: RaidHeaderMeta;
  overviewProps: RaidOverviewSummaryProps;
  initialSignups: RosterPlannerSignup[];
  guildCharacters: GuildCharacterOption[];
  raidLeaderLabel: string;
  /** Anzeige-Name des Organisators (Gilden-Discord-Name); null wenn nicht gesetzt oder nicht auflösbar */
  organizerLabel: string | null;
  canEditRaid: boolean;
  initialPlannerLeaderNotesHtml: string | null;
  /** rf_raid.status — Ankündigen nur bei open */
  raidStatus: string;
  /** Bei status announced: Gruppen/Reserve vom Server (ohne localStorage). */
  persistedServerPlannerOrder?: AnnounceRaidPayload | null;
}) {
  const t = useTranslations('raidDetail');
  const tEdit = useTranslations('raidEdit');
  const tRoster = useTranslations('raidRosterPlanner');
  const tPlanner = useTranslations('raidPlanner');
  const tProfile = useTranslations('profile');
  const tCancelDm = useTranslations('raidCancelDm');
  const router = useRouter();
  const intlLocale = useLocale();

  const defaultCancelDmText = useMemo(
    () =>
      formatDefaultRaidCancelDmDe({
        guildName: raid.guildName,
        raidName: raid.name,
        dungeonLine: raid.dungeonLabel,
        scheduledAt: new Date(raid.scheduledAt),
      }),
    [raid.guildName, raid.name, raid.dungeonLabel, raid.scheduledAt]
  );

  const [signups, setSignups] = useState<RosterPlannerSignup[]>(() => initialSignups);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<{
    signups: RosterPlannerSignup[];
    plannerGroups: PlannerGroup[];
    reserveOrder: string[];
    declineOrder: string[];
    leaderNotesHtml: string;
  } | null>(null);

  const orderStorageKey = useMemo(() => `rf:raidPlannerOrder:${raidId}`, [raidId]);
  useEffect(() => {
    setSignups(initialSignups);
  }, [initialSignups]);

  const byId = useMemo(() => new Map(signups.map((s) => [s.id, s])), [signups]);

  const [plannerGroups, setPlannerGroups] = useState<PlannerGroup[]>(() => [
    applyPartyLayoutToGroup(
      {
        rosterOrder: [],
        raidLeaderUserId: null,
        lootmasterUserId: null,
        partySlots: [],
      },
      raid.maxPlayers
    ),
  ]);
  const [reserveOrder, setReserveOrder] = useState<string[]>(() =>
    orderedReserveSignupIdsForDisplay(
      null,
      initialSignups.map((s) => ({ id: s.id, type: s.signupType }))
    )
  );
  const [declineOrder, setDeclineOrder] = useState<string[]>([]);
  const [declineBlockOpen, setDeclineBlockOpen] = useState(false);

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
        declineOrder?: unknown;
        groups?: unknown;
      };

      const storedFromServer: StoredPlanner | null =
        persistedServerPlannerOrder != null
          ? {
              groups: persistedServerPlannerOrder.groups as unknown,
              reserveOrder: persistedServerPlannerOrder.reserveOrder as unknown,
              declineOrder: persistedServerPlannerOrder.declineOrder as unknown,
            }
          : null;
      const stored: StoredPlanner | null =
        storedFromServer ??
        (raidStatus === 'open' && typeof window !== 'undefined'
          ? safeJsonParse<StoredPlanner>(window.localStorage.getItem(orderStorageKey))
          : null);
      const storedRoster =
        stored && Array.isArray(stored.rosterOrder)
          ? (stored.rosterOrder.filter((x) => typeof x === 'string') as string[])
          : null;
      const storedReserve =
        stored && Array.isArray(stored.reserveOrder)
          ? (stored.reserveOrder.filter((x) => typeof x === 'string') as string[])
          : null;
      const storedDecline =
        stored && Array.isArray(stored.declineOrder)
          ? (stored.declineOrder.filter((x) => typeof x === 'string') as string[])
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
      let nextDecline = normalize(storedDecline);

      const defaultGroup = (): PlannerGroup => ({
        rosterOrder: [],
        raidLeaderUserId: null,
        lootmasterUserId: null,
        partySlots: [],
      });

      const maxPlayers = raid.maxPlayers;
      const withSyncedParties = (g: PlannerGroup): PlannerGroup =>
        applyPartyLayoutToGroup(g, maxPlayers);

      let nextGroups: PlannerGroup[];

      const rawGroups = stored && Array.isArray(stored.groups) ? stored.groups : null;
      if (rawGroups && rawGroups.length > 0) {
        nextGroups = rawGroups.map((g) => {
          const o = g as Record<string, unknown>;
          const ordRaw = o.rosterOrder;
          const ord = Array.isArray(ordRaw)
            ? normalize(ordRaw.filter((x): x is string => typeof x === 'string'))
            : [];
          const rl =
            typeof o.raidLeaderUserId === 'string' && o.raidLeaderUserId.trim()
              ? o.raidLeaderUserId.trim()
              : null;
          const lm =
            typeof o.lootmasterUserId === 'string' && o.lootmasterUserId.trim()
              ? o.lootmasterUserId.trim()
              : null;
          const partySlots = parsePartySlotsFromStored(o.partySlots);
          return withSyncedParties({
            rosterOrder: ord,
            raidLeaderUserId: rl,
            lootmasterUserId: lm,
            partySlots: partySlots ?? [],
          });
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
        nextGroups = [
          {
            rosterOrder: nextRoster,
            raidLeaderUserId: null,
            lootmasterUserId: null,
            partySlots: [],
          },
        ];
      }

      nextGroups = dedupePartySlotsAcrossGroups(
        nextGroups.map((g) =>
          withSyncedParties({
            ...g,
            rosterOrder: g.rosterOrder.filter((id) => placementOf(id) === 'confirmed'),
          })
        ),
        maxPlayers
      );

      if (nextGroups.length === 0) {
        nextGroups = [defaultGroup()];
      }

      if (nextDecline.length > 0) {
        const declineSet = new Set(nextDecline);
        nextGroups = stripSignupIdsFromPlannerGroups(nextGroups, declineSet, maxPlayers);
        nextReserve = nextReserve.filter((id) => !declineSet.has(id));
      }

      const rosterSet = new Set(allRosterIds(nextGroups));
      const declineSetMissing = new Set(nextDecline);
      const missingConfirmed = ids.filter(
        (id) =>
          placementOf(id) === 'confirmed' &&
          !rosterSet.has(id) &&
          !nextReserve.includes(id) &&
          !declineSetMissing.has(id)
      );
      if (missingConfirmed.length > 0 && nextGroups[0]) {
        let slots = nextGroups[0].partySlots;
        for (const mid of missingConfirmed) {
          const empty = findFirstEmptyPartyCell(slots, maxPlayers);
          if (!empty) break;
          slots = setPartyCell(slots, empty.partyIndex, empty.cellIndex, mid, maxPlayers);
        }
        nextGroups = [
          applyPartyLayoutToGroup({ ...nextGroups[0], partySlots: slots }, maxPlayers),
          ...nextGroups.slice(1),
        ];
        nextGroups = dedupePartySlotsAcrossGroups(nextGroups, maxPlayers);
      }

      const rosterSetFinal = new Set(allRosterIds(nextGroups));
      nextReserve = nextReserve.filter((id) => !rosterSetFinal.has(id));
      nextReserve = orderedReserveSignupIdsForDisplay(
        nextReserve.length > 0 ? nextReserve : null,
        rows.map((r) => ({ id: r.id, type: r.signupType }))
      ).filter((id) => !rosterSetFinal.has(id));

      if (nextDecline.length === 0) {
        for (const id of ids) {
          if (rosterSetFinal.has(id) || nextReserve.includes(id)) continue;
          const row = rows.find((x) => x.id === id);
          if (row && typeNorm(row.signupType) === 'declined') nextDecline.push(id);
        }
      }
      nextDecline = nextDecline.filter(
        (id) => !rosterSetFinal.has(id) && !nextReserve.includes(id)
      );

      setPlannerGroups(nextGroups);
      setReserveOrder(nextReserve);
      setDeclineOrder(nextDecline);

      setSavedSnapshot({
        signups: rows,
        plannerGroups: nextGroups,
        reserveOrder: nextReserve,
        declineOrder: nextDecline,
        leaderNotesHtml: initialPlannerLeaderNotesHtml ?? '',
      });
    },
    [
      orderStorageKey,
      initialPlannerLeaderNotesHtml,
      persistedServerPlannerOrder,
      raid.maxPlayers,
      raidStatus,
    ]
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
  const [attendanceFilter, setAttendanceFilter] = useState<{
    bin_da: boolean;
    unklar: boolean;
    nicht_da: boolean;
  }>({
    bin_da: true,
    unklar: true,
    nicht_da: true,
  });
  const [pulseForbidReserveId, setPulseForbidReserveId] = useState<string | null>(null);

  const [leaderMenuOpen, setLeaderMenuOpen] = useState(false);
  const [leaderMenuPos, setLeaderMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [cancelDmOpen, setCancelDmOpen] = useState(false);
  const [cancelDmBusy, setCancelDmBusy] = useState(false);

  type FloatingSignupNoteState = {
    playerLabel: string;
    charName: string;
    punctualityLabel: string;
    note: string;
    left: number;
    top: number;
  };
  const [floatingSignupNote, setFloatingSignupNote] = useState<FloatingSignupNoteState | null>(null);
  const [allSignupNotesOpen, setAllSignupNotesOpen] = useState(false);
  const floatingNotePanelRef = useRef<HTMLDivElement | null>(null);
  const [leaderNotesExpanded, setLeaderNotesExpanded] = useState(false);
  const [leaderNotesHtml, setLeaderNotesHtml] = useState(() => initialPlannerLeaderNotesHtml ?? '');
  const [notesBootstrapKey, setNotesBootstrapKey] = useState(0);

  useEffect(() => {
    setLeaderNotesHtml(initialPlannerLeaderNotesHtml ?? '');
    setNotesBootstrapKey((k) => k + 1);
  }, [raidId, initialPlannerLeaderNotesHtml]);

  const [blinkDiscordForIds, setBlinkDiscordForIds] = useState<Set<string>>(() => new Set());

  const [filtersOpen, setFiltersOpen] = useState(true);
  const [raidOptionsOpen, setRaidOptionsOpen] = useState(true);
  const [comparisonOpen, setComparisonOpen] = useState(true);
  const [comparisonEnabled, setComparisonEnabled] = useState(false);
  const [comparisonRaidId, setComparisonRaidId] = useState<string | null>(null);
  const [comparisonRaidLabel, setComparisonRaidLabel] = useState<string | null>(null);
  const [comparisonPlacements, setComparisonPlacements] = useState<
    Record<string, ComparisonPlacement>
  >({});
  const [comparisonList, setComparisonList] = useState<
    {
      id: string;
      name: string;
      scheduledAt: string;
      status: string;
      dungeonLabel: string;
    }[]
  >([]);
  const [comparisonListLoading, setComparisonListLoading] = useState(false);
  const [comparisonCursorBefore, setComparisonCursorBefore] = useState<string | null>(null);
  const [comparisonCursorAfter, setComparisonCursorAfter] = useState<string | null>(null);
  const [comparisonHasOlder, setComparisonHasOlder] = useState(false);
  const [comparisonHasNewer, setComparisonHasNewer] = useState(false);
  const [comparisonTodayStart, setComparisonTodayStart] = useState<string | null>(null);

  const syncPlannerGroupsParties = useCallback(
    (groups: PlannerGroup[]) => groups.map((g) => applyPartyLayoutToGroup(g, raid.maxPlayers)),
    [raid.maxPlayers]
  );

  const loadComparisonRaids = useCallback(
    async (opts: { after?: string | null; before?: string | null } = {}) => {
      setComparisonListLoading(true);
      try {
        const q = new URLSearchParams({
          excludeRaidId: raidId,
          locale: intlLocale,
        });
        if (opts.before) q.set('before', opts.before);
        else if (opts.after) q.set('after', opts.after);
        const res = await fetch(
          `/api/guilds/${encodeURIComponent(guildId)}/raids/planner-comparison-list?${q}`
        );
        if (!res.ok) throw new Error('list failed');
        const data = (await res.json()) as {
          raids: typeof comparisonList;
          cursors: { prevBefore: string; nextAfter: string; todayStart: string };
          hasOlder: boolean;
          hasNewer: boolean;
        };
        setComparisonList(data.raids);
        setComparisonCursorBefore(data.cursors.prevBefore);
        setComparisonCursorAfter(data.cursors.nextAfter);
        setComparisonHasOlder(data.hasOlder);
        setComparisonHasNewer(data.hasNewer);
        setComparisonTodayStart(data.cursors.todayStart);
      } catch {
        setComparisonList([]);
      } finally {
        setComparisonListLoading(false);
      }
    },
    [guildId, raidId, intlLocale]
  );

  useEffect(() => {
    if (!comparisonOpen) return;
    void loadComparisonRaids({});
  }, [comparisonOpen, loadComparisonRaids]);

  useEffect(() => {
    if (!comparisonEnabled || !comparisonRaidId) {
      setComparisonPlacements({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(comparisonRaidId)}/comparison-placement`
        );
        if (!res.ok) throw new Error('placement failed');
        const data = (await res.json()) as { placements: Record<string, ComparisonPlacement> };
        if (!cancelled) setComparisonPlacements(data.placements ?? {});
      } catch {
        if (!cancelled) setComparisonPlacements({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [comparisonEnabled, comparisonRaidId, guildId]);

  const [unsetPlayersMode, setUnsetPlayersMode] = useState<UnsetPlayersMode>('reserve');
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
  /** Feste Position beim Kurz-Ziehen, damit Quick-Menü und Bubble nicht mitwandern. */
  const [quickMenuAnchor, setQuickMenuAnchor] = useState<{
    clientX: number;
    clientY: number;
  } | null>(null);
  const [flyBack, setFlyBack] = useState<FlyBackState | null>(null);


  const scheduledAt = useMemo(() => new Date(raid.scheduledAt), [raid.scheduledAt]);
  const scheduledEndAt = raid.scheduledEndAt ? new Date(raid.scheduledEndAt) : null;
  const raidTermin = formatRaidTerminLine(intlLocale, scheduledAt, scheduledEndAt);
  const guildCharacterById = useMemo(
    () => new Map(guildCharacters.map((c) => [c.id, c])),
    [guildCharacters]
  );

  const resolveDiscordNameForSignup = useCallback(
    (s: RosterPlannerSignup): string | null => {
      const direct = s.discordName?.trim();
      if (direct) return direct;

      const cid = (s.characterId ?? '').trim();
      if (cid) {
        const fromCharacter = guildCharacterById.get(cid)?.guildDiscordDisplayName?.trim();
        if (fromCharacter) return fromCharacter;
      }

      const uid = (s.userId ?? '').trim();
      if (!uid) return null;

      for (const c of guildCharacters) {
        if (c.userId.trim() !== uid || !c.isMain) continue;
        const d = c.guildDiscordDisplayName?.trim();
        if (d) return d;
      }
      for (const c of guildCharacters) {
        if (c.userId.trim() !== uid) continue;
        const d = c.guildDiscordDisplayName?.trim();
        if (d) return d;
      }
      for (const other of signups) {
        if (other.id === s.id) continue;
        if ((other.userId ?? '').trim() !== uid) continue;
        const d = other.discordName?.trim();
        if (d) return d;
      }
      return null;
    },
    [guildCharacterById, guildCharacters, signups]
  );

  const resolveGearScoreForSignup = useCallback(
    (s: RosterPlannerSignup): number | null => {
      if (typeof s.gearScore === 'number') return s.gearScore;

      const cid = (s.characterId ?? '').trim();
      if (cid) {
        const g = guildCharacterById.get(cid)?.gearScore;
        if (typeof g === 'number') return g;
      }

      const uid = (s.userId ?? '').trim();
      if (!uid) return null;
      for (const c of guildCharacters) {
        if (c.userId.trim() !== uid) continue;
        if (typeof c.gearScore === 'number') return c.gearScore;
      }
      for (const other of signups) {
        if (other.id === s.id) continue;
        if ((other.userId ?? '').trim() !== uid) continue;
        if (typeof other.gearScore === 'number') return other.gearScore;
      }
      return null;
    },
    [guildCharacterById, guildCharacters, signups]
  );

  const resolveDiscordNameForCharacterOption = useCallback(
    (c: GuildCharacterOption): string | null => {
      const direct = c.guildDiscordDisplayName?.trim();
      if (direct) return direct;

      const uid = c.userId.trim();
      if (!uid) return null;
      for (const other of guildCharacters) {
        if (other.userId.trim() !== uid || !other.isMain) continue;
        const d = other.guildDiscordDisplayName?.trim();
        if (d) return d;
      }
      for (const other of guildCharacters) {
        if (other.userId.trim() !== uid) continue;
        const d = other.guildDiscordDisplayName?.trim();
        if (d) return d;
      }
      for (const s of signups) {
        if ((s.userId ?? '').trim() !== uid) continue;
        const d = s.discordName?.trim();
        if (d) return d;
      }
      return null;
    },
    [guildCharacters, signups]
  );

  const resolveGearScoreForCharacterOption = useCallback(
    (c: GuildCharacterOption): number | null => {
      if (typeof c.gearScore === 'number') return c.gearScore;

      const uid = c.userId.trim();
      if (!uid) return null;
      for (const other of guildCharacters) {
        if (other.userId.trim() !== uid) continue;
        if (typeof other.gearScore === 'number') return other.gearScore;
      }
      for (const s of signups) {
        if ((s.userId ?? '').trim() !== uid) continue;
        if (typeof s.gearScore === 'number') return s.gearScore;
      }
      return null;
    },
    [guildCharacters, signups]
  );

  const leaderLootUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of guildCharacters) {
      const u = c.userId.trim();
      if (u) ids.add(u);
    }
    for (const s of signups) {
      const u = (s.userId ?? '').trim();
      if (u) ids.add(u);
    }
    const discordForSort = (uid: string) => {
      for (const c of guildCharacters) {
        if (c.userId.trim() !== uid || !c.isMain) continue;
        const d = c.guildDiscordDisplayName?.trim();
        if (d) return d.toLowerCase();
      }
      for (const c of guildCharacters) {
        if (c.userId.trim() !== uid) continue;
        const d = c.guildDiscordDisplayName?.trim();
        if (d) return d.toLowerCase();
      }
      for (const s of signups) {
        if ((s.userId ?? '').trim() !== uid) continue;
        const d = s.discordName?.trim();
        if (d) return d.toLowerCase();
      }
      return uid.toLowerCase();
    };
    return [...ids].sort((a, b) => discordForSort(a).localeCompare(discordForSort(b), intlLocale));
  }, [guildCharacters, signups, intlLocale]);

  const formatLeaderLootOptionLabel = useCallback(
    (userId: string, rosterOrder: string[]) => {
      const uid = userId.trim();
      let discord = '';
      for (const c of guildCharacters) {
        if (c.userId.trim() !== uid || !c.isMain) continue;
        const d = c.guildDiscordDisplayName?.trim();
        if (d) {
          discord = d;
          break;
        }
      }
      if (!discord) {
        for (const c of guildCharacters) {
          if (c.userId.trim() !== uid) continue;
          const d = c.guildDiscordDisplayName?.trim();
          if (d) {
            discord = d;
            break;
          }
        }
      }
      if (!discord) {
        for (const s of signups) {
          if ((s.userId ?? '').trim() !== uid) continue;
          const d = s.discordName?.trim();
          if (d) {
            discord = d;
            break;
          }
        }
      }
      if (!discord) discord = t('signupAnonymous');

      let charName = '';
      for (const sid of rosterOrder) {
        const s = byId.get(sid);
        if (!s || (s.userId ?? '').trim() !== uid) continue;
        charName = s.name.trim();
        break;
      }
      if (!charName) charName = tRoster('leaderOptionCharMissing');

      return `${discord} @ ${charName}`;
    },
    [byId, guildCharacters, signups, t, tRoster]
  );

  const signupRowsForReserveOrder = useMemo(
    () => signups.map((s) => ({ id: s.id, type: s.signupType })),
    [signups]
  );

  /** Wie Raid-Detail / Embed: Reserve inkl. Anmeldetyp „Reserve“, ohne Teilnehmer im Roster. */
  const reserveBenchOrderedIds = useMemo(() => {
    const ord = orderedReserveSignupIdsForDisplay(reserveOrder, signupRowsForReserveOrder);
    const roster = new Set(allRosterIds(plannerGroups));
    const decline = new Set(declineOrder);
    return ord.filter((id) => !roster.has(id) && !decline.has(id));
  }, [reserveOrder, signupRowsForReserveOrder, plannerGroups, declineOrder]);

  const declineBenchOrderedIds = useMemo(() => {
    const roster = new Set(allRosterIds(plannerGroups));
    const reserve = new Set(reserveBenchOrderedIds);
    return declineOrder.filter((id) => byId.has(id) && !roster.has(id) && !reserve.has(id));
  }, [declineOrder, plannerGroups, reserveBenchOrderedIds, byId]);

  const poolIds = useMemo(() => {
    const placed = new Set([
      ...allRosterIds(plannerGroups),
      ...reserveBenchOrderedIds,
      ...declineBenchOrderedIds,
    ]);
    return signups.map((s) => s.id).filter((id) => !placed.has(id));
  }, [signups, plannerGroups, reserveBenchOrderedIds, declineBenchOrderedIds]);

  const signupsWithNotesList = useMemo(() => {
    return signups
      .filter((s) => (s.note?.trim() ?? '').length > 0)
      .map((s) => {
        const p = punctualityOf(s);
        const punctLabel =
          p === 'on_time' ? t('punctualityOnTime') : p === 'tight' ? t('punctualityTight') : t('punctualityLate');
        return {
          id: s.id,
          playerLabel: resolveDiscordNameForSignup(s) || t('signupAnonymous'),
          charName: s.name,
          punctualityLabel: punctLabel,
          note: (s.note ?? '').trim(),
        };
      });
  }, [resolveDiscordNameForSignup, signups, t]);

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

  const passesAttendanceFilter = useCallback(
    (s: RosterPlannerSignup) => {
      const tn = typeNorm(s.signupType);
      if (tn === 'reserve') return true;
      if (tn === 'declined') return attendanceFilter.nicht_da;
      if (tn === 'uncertain') return attendanceFilter.unklar;
      return attendanceFilter.bin_da;
    },
    [attendanceFilter]
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
      return passesCharFilters(s) && passesPunctuality(s) && passesAttendanceFilter(s);
    });
  }, [poolIds, byId, passesCharFilters, passesPunctuality, passesAttendanceFilter]);

  const standardPoolIds = useMemo(
    () =>
      filteredPoolIds.filter((id) => {
        const s = byId.get(id);
        if (!s) return false;
        const tn = typeNorm(s.signupType);
        return tn !== 'uncertain' && tn !== 'declined';
      }),
    [filteredPoolIds, byId]
  );

  const uncertainPoolIds = useMemo(
    () =>
      filteredPoolIds.filter((id) => {
        const s = byId.get(id);
        return !!s && typeNorm(s.signupType) === 'uncertain';
      }),
    [filteredPoolIds, byId]
  );

  const declinedPoolIds = useMemo(
    () =>
      filteredPoolIds.filter((id) => {
        if (declineBenchOrderedIds.includes(id)) return false;
        const s = byId.get(id);
        return !!s && typeNorm(s.signupType) === 'declined';
      }),
    [filteredPoolIds, byId, declineBenchOrderedIds]
  );

  const filteredReserveIds = useMemo(() => {
    return reserveBenchOrderedIds.filter((id) => {
      const s = byId.get(id);
      if (!s) return false;
      return (
        passesCharFilters(s) && passesPunctuality(s) && passesAttendanceFilter(s)
      );
    });
  }, [reserveBenchOrderedIds, byId, passesCharFilters, passesPunctuality, passesAttendanceFilter]);

  const poolIdsToRoleMap = useCallback((ids: string[]) => {
    const m = new Map<TbcRole, string[]>();
    for (const r of ROLE_ORDER) m.set(r, []);
    for (const id of ids) {
      const s = byId.get(id);
      if (!s) continue;
      m.get(s.role)?.push(id);
    }
    return m;
  }, [byId]);

  const standardPoolByRole = useMemo(
    () => poolIdsToRoleMap(standardPoolIds),
    [standardPoolIds, poolIdsToRoleMap]
  );

  const uncertainPoolByRole = useMemo(
    () => poolIdsToRoleMap(uncertainPoolIds),
    [uncertainPoolIds, poolIdsToRoleMap]
  );

  const declinedPoolByRole = useMemo(
    () => poolIdsToRoleMap(declinedPoolIds),
    [declinedPoolIds, poolIdsToRoleMap]
  );

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

  const declineBlockFilteredIds = useMemo(() => {
    return declineBenchOrderedIds.filter((id) => {
      const s = byId.get(id);
      if (!s) return false;
      return (
        passesCharFilters(s) && passesPunctuality(s) && passesAttendanceFilter(s)
      );
    });
  }, [
    declineBenchOrderedIds,
    byId,
    passesCharFilters,
    passesPunctuality,
    passesAttendanceFilter,
  ]);

  const declineBlockByRole = useMemo(
    () => poolIdsToRoleMap(declineBlockFilteredIds),
    [declineBlockFilteredIds, poolIdsToRoleMap]
  );

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
        setFloatingSignupNote(null);
        setAllSignupNotesOpen(false);
        setAddOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!floatingSignupNote) return;
    let handler: ((e: MouseEvent) => void) | null = null;
    const id = window.setTimeout(() => {
      handler = (e: MouseEvent) => {
        const el = floatingNotePanelRef.current;
        if (el && e.target instanceof Node && el.contains(e.target)) return;
        setFloatingSignupNote(null);
      };
      document.addEventListener('mousedown', handler);
    }, 0);
    return () => {
      window.clearTimeout(id);
      if (handler) document.removeEventListener('mousedown', handler);
    };
  }, [floatingSignupNote]);

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

  const toggleAttendance = (k: 'bin_da' | 'unklar' | 'nicht_da') => {
    setAttendanceFilter((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      if (!next.bin_da && !next.unklar && !next.nicht_da) return prev;
      return next;
    });
  };

  const toggleAllowWeekday = () => setAllowWeekday((v) => (!v && !allowWeekend ? v : !v));
  const toggleAllowWeekend = () => setAllowWeekend((v) => (!v && !allowWeekday ? v : !v));

  const endDrag = useCallback(() => {
    setDragSession(null);
    setDragPoint(null);
    setQuickMenuAnchor(null);
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
      const id = sess.signupId;
      const origin = sess.originRect;

      const patchSignupRow = (patch: Partial<Pick<RosterPlannerSignup, 'leaderPlacement' | 'signupType'>>) => {
        setSignups((prev) =>
          prev.map((s) => (s.id === id ? { ...s, ...patch } : s))
        );
      };

      const applyPool = () => {
        setPlannerGroups((groups) =>
          syncPlannerGroupsParties(
            groups.map((g) => ({
              ...g,
              rosterOrder: g.rosterOrder.filter((x) => x !== id),
              partySlots: g.partySlots.map((row) => row.filter((x) => x !== id)),
            }))
          )
        );
        setReserveOrder((o) => o.filter((x) => x !== id));
        setDeclineOrder((o) => o.filter((x) => x !== id));
        const row = byId.get(id);
        const tn = row ? typeNorm(row.signupType) : 'normal';
        patchSignupRow({
          leaderPlacement: 'signup',
          ...(tn === 'declined' ? { signupType: 'normal' as const } : {}),
        });
      };

      const applyDecline = () => {
        setPlannerGroups((groups) =>
          syncPlannerGroupsParties(
            groups.map((g) => ({
              ...g,
              rosterOrder: g.rosterOrder.filter((x) => x !== id),
              partySlots: g.partySlots.map((row) => row.filter((x) => x !== id)),
            }))
          )
        );
        setReserveOrder((o) => o.filter((x) => x !== id));
        setDeclineOrder((o) => (o.includes(id) ? o : [...o, id]));
        patchSignupRow({ leaderPlacement: 'signup', signupType: 'declined' });
      };

      const applyReserve = (): boolean => {
        const dragged = byId.get(id);
        if (dragged?.forbidReserve) {
          setPulseForbidReserveId(id);
          window.setTimeout(() => {
            setPulseForbidReserveId((cur) => (cur === id ? null : cur));
          }, 900);
          return false;
        }
        setPlannerGroups((groups) =>
          syncPlannerGroupsParties(
            groups.map((g) => ({
              ...g,
              rosterOrder: g.rosterOrder.filter((x) => x !== id),
              partySlots: g.partySlots.map((row) => row.filter((x) => x !== id)),
            }))
          )
        );
        setDeclineOrder((o) => o.filter((x) => x !== id));
        setReserveOrder((o) => (o.includes(id) ? o : [...o, id]));
        const tn = dragged ? typeNorm(dragged.signupType) : 'normal';
        patchSignupRow({
          leaderPlacement: 'substitute',
          ...(tn === 'declined' ? { signupType: 'reserve' as const } : {}),
        });
        return true;
      };

      const quick = findQuickDropTarget(e.clientX, e.clientY);
      if (quick === 'pool') {
        applyPool();
        endDrag();
        return;
      }
      if (quick === 'decline') {
        applyDecline();
        endDrag();
        return;
      }
      if (quick === 'reserve') {
        if (!applyReserve()) {
          setFlyBack({
            signupId: id,
            fromLeft: e.clientX - sess.offsetX,
            fromTop: e.clientY - sess.offsetY,
            toLeft: origin.left,
            toTop: origin.top,
            width: origin.width,
            height: origin.height,
          });
        }
        endDrag();
        return;
      }

      const target = findDropTarget(e.clientX, e.clientY);

      if (target?.kind === 'pool') {
        applyPool();
        endDrag();
        return;
      }

      if (target?.kind === 'decline') {
        applyDecline();
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
        if (applyReserve()) {
          endDrag();
        }
        return;
      }

      const placeInGroupParty = (destGi: number, partyIndex: number, cellIndex: number) => {
        const dragged = byId.get(id);
        const draggedUserId = (dragged?.userId ?? '').trim() || null;
        if (draggedUserId) {
          const groupsSans = plannerGroups.map((g) => ({
            ...g,
            partySlots: g.partySlots.map((row) => row.filter((x) => x !== id)),
          }));
          const conflictId = findUserRosterConflict(
            syncPlannerGroupsParties(groupsSans),
            byId,
            id,
            draggedUserId
          );
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
        setReserveOrder((o) => o.filter((x) => x !== id));
        setDeclineOrder((o) => o.filter((x) => x !== id));
        setPlannerGroups((groups) =>
          syncPlannerGroupsParties(
            groups.map((g, gi) => {
              const cleared = g.partySlots.map((row) => row.filter((x) => x !== id));
              if (gi !== destGi) return applyPartyLayoutToGroup({ ...g, partySlots: cleared }, raid.maxPlayers);
              const nextSlots = setPartyCell(cleared, partyIndex, cellIndex, id, raid.maxPlayers);
              return applyPartyLayoutToGroup({ ...g, partySlots: nextSlots }, raid.maxPlayers);
            })
          )
        );
        const row = byId.get(id);
        const tn = row ? typeNorm(row.signupType) : 'normal';
        patchSignupRow({
          leaderPlacement: 'confirmed',
          ...(tn === 'declined' ? { signupType: 'normal' as const } : {}),
        });
        endDrag();
      };

      if (target?.kind === 'party') {
        const destGi = target.groupIndex;
        const destPi = target.partyIndex;
        if (destGi < 0 || destGi >= plannerGroups.length || destPi < 0) {
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
        const cell =
          typeof target.cellIndex === 'number' && target.cellIndex >= 0 ? target.cellIndex : 0;
        placeInGroupParty(destGi, destPi, cell);
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
        const group = plannerGroups[destGi];
        const empty = findFirstEmptyPartyCell(group?.partySlots ?? [], raid.maxPlayers);
        if (!empty) {
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
        placeInGroupParty(destGi, empty.partyIndex, empty.cellIndex);
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
    source: 'roster' | 'reserve' | 'pool' | 'party'
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
      startClientX: e.clientX,
      startClientY: e.clientY,
    });
    setDragPoint({ clientX: e.clientX, clientY: e.clientY });
    setQuickMenuAnchor({ clientX: e.clientX, clientY: e.clientY });
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
            'relative inline-flex items-center gap-0.5 shrink-0 rounded-sm',
            canSwitch && !isSigned ? 'cursor-pointer' : 'cursor-default',
            showOverrideRing && 'ring-2 ring-green-600/70 dark:ring-green-500/70 ring-offset-1 ring-offset-background'
          )}
          title={spec}
        >
          <span className={cn(gray && 'grayscale opacity-[0.85]')}>
            <CharacterSpecIconsInline mainSpec={spec} offSpec={null} size={22} slashClassName="hidden" />
          </span>
          {isSigned && s.onlySignedSpec ? (
            <span
              className="text-sm leading-none shrink-0"
              title={tRoster('specLockHint')}
              aria-label={tRoster('specLockHint')}
            >
              🔒
            </span>
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

  function renderRow(
    s: RosterPlannerSignup,
    source: 'roster' | 'reserve' | 'pool' | 'party',
    index?: number
  ) {
    const isDragging = draggingId === s.id;
    const note = s.note?.trim() ?? '';
    const uid = (s.userId ?? '').trim();
    const cmpPlacement =
      comparisonEnabled && uid ? (comparisonPlacements[uid] ?? null) : null;
    const displayDiscordName = resolveDiscordNameForSignup(s);
    const displayGearScore = resolveGearScoreForSignup(s);
    const punct = punctualityOf(s);
    const punctLabel =
      punct === 'on_time' ? t('punctualityOnTime') : punct === 'tight' ? t('punctualityTight') : t('punctualityLate');
    const attVariant = attendanceRowVariant(s);
    return (
      <div
        key={`${source}-${s.id}`}
        role="listitem"
        data-planner-row
        data-signup-id={s.id}
        className={cn(
          'flex flex-wrap items-center gap-2 rounded-lg border bg-background px-2 py-1.5 text-sm cursor-grab active:cursor-grabbing touch-none select-none',
          attVariant === 'default' && 'border-border',
          attVariant === 'uncertain' && 'border-red-400/60 dark:border-red-700/55',
          attVariant === 'declined' &&
            'border-red-400/60 dark:border-red-800/50 bg-red-500/[0.09] dark:bg-red-950/40',
          comparisonRowClass(cmpPlacement, comparisonEnabled),
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
          <CharacterDiscordPill discordName={displayDiscordName} blink={blinkDiscordForIds.has(s.id)} />
          <CharacterGearscorePill gearScore={displayGearScore} />
          {note.length > 0 ? (
            <button
              type="button"
              className="shrink-0 text-base leading-none opacity-80 hover:opacity-100"
              title={note}
              aria-label={t('participantNotiz')}
              onClick={(e) => {
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                const panelW = 300;
                const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelW - 8));
                const top = Math.min(rect.bottom + 6, window.innerHeight - 8);
                const punct = punctualityOf(s);
                const punctLbl =
                  punct === 'on_time'
                    ? t('punctualityOnTime')
                    : punct === 'tight'
                      ? t('punctualityTight')
                      : t('punctualityLate');
                setFloatingSignupNote({
                  playerLabel: displayDiscordName || t('signupAnonymous'),
                  charName: s.name,
                  punctualityLabel: punctLbl,
                  note,
                  left,
                  top,
                });
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
  const dragQuickMenuActive = !!dragSession && !!quickMenuAnchor;
  const quickMenuLayout =
    dragSession && quickMenuAnchor
      ? {
          menuLeft: quickMenuAnchor.clientX,
          menuTop: quickMenuAnchor.clientY - dragSession.offsetY,
        }
      : null;

  function addManualSignup() {
    if (!addSelected) return;
    if (usedCharacterIds.has(addSelected.id)) return;
    const note = `Gesetzt von Raidleader ${raidLeaderLabel}`;
    const id = `manual:${addSelected.id}`;
    const fallbackDiscord = resolveDiscordNameForCharacterOption(addSelected);
    const fallbackGearScore = resolveGearScoreForCharacterOption(addSelected);
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
        discordName: fallbackDiscord,
        gearScore: fallbackGearScore,
        note,
        profileWeekFocus: null,
      };
      return [...prev, row];
    });
    setAddOpen(false);
    setAddQuery('');
    setAddSelectedId(null);
  }

  async function submitRaidCancelFromOverlay(discordMessage: string) {
    setCancelDmBusy(true);
    try {
      const res = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', cancelDiscordMessage: discordMessage }),
      });
      if (!res.ok) return;
      setCancelDmOpen(false);
      setLeaderMenuOpen(false);
      router.push(`/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`);
      router.refresh();
    } finally {
      setCancelDmBusy(false);
    }
  }

  async function doSaveDraft() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const declinePlacementSetPre = new Set(declineOrder);
      const plannerGroupsForSave = stripSignupIdsFromPlannerGroups(
        plannerGroups,
        declinePlacementSetPre,
        raid.maxPlayers
      );
      const rosterFlat = allRosterIds(plannerGroupsForSave);
      const rosterSetForPlacement = new Set(rosterFlat);
      const forbidReserveById = new Map(signups.map((s) => [s.id, !!s.forbidReserve]));
      const baseReserve = orderedReserveSignupIdsForDisplay(
        reserveOrder,
        signups.map((s) => ({ id: s.id, type: s.signupType }))
      ).filter((id) => !rosterSetForPlacement.has(id));
      const policyApplied = applyPlannerUnsetPolicy({
        allSignupIds: signups.map((s) => s.id),
        rosterIdSet: rosterSetForPlacement,
        reserveOrder: baseReserve,
        declineOrder,
        forbidReserveById,
        unsetPlayersMode,
      });
      const effectiveReserveOrder = policyApplied.reserveOrder;
      const effectiveDeclineOrder = policyApplied.declineOrder;
      const reservePlacementSet = new Set(effectiveReserveOrder);
      const declinePlacementSet = new Set(effectiveDeclineOrder);

      for (const rid of rosterFlat) {
        const row = byId.get(rid);
        const uid = (row?.userId ?? '').trim();
        if (!uid) continue;
        if (findUserRosterConflict(plannerGroupsForSave, byId, rid, uid)) {
          setSaveError(tRoster('saveErrorDiscordMultiGroup'));
          setSaving(false);
          return;
        }
      }

      const placementForId = (id: string): 'signup' | 'substitute' | 'confirmed' => {
        const row = byId.get(id);
        return leaderPlacementForPlannerSlot({
          onRoster: rosterFlat.includes(id),
          onReserveBench: reservePlacementSet.has(id),
          onDeclineBlock: declinePlacementSet.has(id),
          forbidReserve: !!row?.forbidReserve,
          unsetPlayersMode,
        });
      };

      const idToRow = new Map(signups.map((s) => [s.id, s]));

      const mappings: Array<{ oldId: string; newId: string }> = [];

      const saveOne = async (id: string): Promise<{ oldId: string; newId: string } | null> => {
        const row = idToRow.get(id);
        if (!row) return null;
        const leaderPlacement = placementForId(id);
        const plannerDeclined = declinePlacementSet.has(id);
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
                unsetPlayersMode,
                plannerDeclined,
              }),
            }
          );
          if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(formatSignupApiErrorPayload(txt) || 'Failed to create signup');
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
            body: JSON.stringify({
              leaderPlacement,
              signedSpec,
              unsetPlayersMode,
              plannerDeclined,
            }),
          }
        );
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          throw new Error(formatSignupApiErrorPayload(txt) || 'Failed to save');
        }
        return null;
      };

      // Execute sequentially to keep errors deterministic.
      for (const s of signups) {
        const m = await saveOne(s.id);
        if (m) mappings.push(m);
      }

      let snapshotSignups = signups;
      let snapshotGroups = plannerGroupsForSave;
      let snapshotReserve = effectiveReserveOrder;
      let snapshotDecline = effectiveDeclineOrder;

      if (mappings.length > 0) {
        const map = new Map(mappings.map((m) => [m.oldId, m.newId]));
        snapshotSignups = signups.map((row) => {
          const nid = map.get(row.id);
          if (!nid) return row;
          const declined = effectiveDeclineOrder.includes(row.id);
          return {
            ...row,
            id: nid,
            leaderPlacement: placementForId(row.id),
            signupType: declined ? 'declined' : row.signupType,
          };
        });
        snapshotGroups = plannerGroupsForSave.map((g) => ({
          ...g,
          rosterOrder: g.rosterOrder.map((id) => map.get(id) ?? id),
          partySlots: g.partySlots.map((row) => row.map((id) => map.get(id) ?? id)),
        }));
        snapshotReserve = effectiveReserveOrder.map((id) => map.get(id) ?? id);
        snapshotDecline = effectiveDeclineOrder.map((id) => map.get(id) ?? id);
        setSignups(snapshotSignups);
        setPlannerGroups(snapshotGroups);
      }

      const snapRosterFlat = allRosterIds(snapshotGroups);
      const snapRosterSet = new Set(snapRosterFlat);
      const snapForbid = new Map(snapshotSignups.map((s) => [s.id, !!s.forbidReserve]));
      const snapPolicy = applyPlannerUnsetPolicy({
        allSignupIds: snapshotSignups.map((s) => s.id),
        rosterIdSet: snapRosterSet,
        reserveOrder: orderedReserveSignupIdsForDisplay(
          snapshotReserve,
          snapshotSignups.map((s) => ({ id: s.id, type: s.signupType }))
        ).filter((id) => !snapRosterSet.has(id)),
        declineOrder: snapshotDecline,
        forbidReserveById: snapForbid,
        unsetPlayersMode,
      });
      snapshotReserve = snapPolicy.reserveOrder;
      snapshotDecline = snapPolicy.declineOrder;
      snapshotGroups = stripSignupIdsFromPlannerGroups(
        snapshotGroups,
        new Set(snapshotDecline),
        raid.maxPlayers
      );
      setPlannerGroups(snapshotGroups);
      setReserveOrder(snapshotReserve);
      setDeclineOrder(snapshotDecline);

      const notesToSave = sanitizePlannerLeaderHtml(leaderNotesHtml);
      if (canEditRaid) {
        const plannerLayoutPayload = {
          groups: syncPlannerGroupsParties(snapshotGroups).map((g) => ({
            rosterOrder: g.rosterOrder,
            raidLeaderUserId: g.raidLeaderUserId,
            lootmasterUserId: g.lootmasterUserId,
            partySlots: g.partySlots,
          })),
          reserveOrder: snapshotReserve,
          declineOrder: snapshotDecline,
        };
        const resRaid = await fetch(
          `/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              plannerLeaderNotesHtml: notesToSave || null,
              ...(raidStatus === 'open' ? { draftPlannerGroupsJson: plannerLayoutPayload } : {}),
              ...(raidStatus === 'announced' ? { announcedPlannerGroupsJson: plannerLayoutPayload } : {}),
            }),
          }
        );
        if (!resRaid.ok) {
          const txt = await resRaid.text().catch(() => '');
          throw new Error(formatSignupApiErrorPayload(txt) || 'Failed to save raid planner notes');
        }
      }

      // Persist order locally for next visit.
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(
          orderStorageKey,
          JSON.stringify({
            groups: snapshotGroups,
            reserveOrder: snapshotReserve,
            declineOrder: snapshotDecline,
          })
        );
      }

      const declineSnapSet = new Set(snapshotDecline);
      const rosterSnapSet = new Set(allRosterIds(snapshotGroups));
      const reserveSnapSet = new Set(snapshotReserve);
      snapshotSignups = snapshotSignups.map((s) => {
        if (declineSnapSet.has(s.id)) {
          return { ...s, leaderPlacement: 'signup' as const, signupType: 'declined' };
        }
        if (rosterSnapSet.has(s.id)) {
          return { ...s, leaderPlacement: 'confirmed' as const };
        }
        if (reserveSnapSet.has(s.id)) {
          return { ...s, leaderPlacement: 'substitute' as const };
        }
        return { ...s, leaderPlacement: 'signup' as const };
      });

      setSavedSnapshot({
        signups: snapshotSignups,
        plannerGroups: snapshotGroups,
        reserveOrder: snapshotReserve,
        declineOrder: snapshotDecline,
        leaderNotesHtml: notesToSave,
      });
      setLastSavedAt(Date.now());
      setSignups(snapshotSignups);
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function removePlannerGroupAt(groupIndex: number) {
    if (plannerGroups.length <= 1) return;
    if (!window.confirm(tRoster('removeGroupConfirm'))) return;
    const removed = plannerGroups[groupIndex];
    if (!removed) return;
    const removedRoster = rosterOrderFromPartySlots(removed.partySlots);
    const nextGroups = plannerGroups.filter((_, i) => i !== groupIndex);
    const otherSet = new Set(allRosterIds(nextGroups));
    const rowById = new Map(signups.map((s) => [s.id, s]));

    setSignups((prev) =>
      prev.map((s) => {
        if (!removedRoster.includes(s.id) || otherSet.has(s.id)) return s;
        const wantsReserve = s.signupType === 'reserve';
        return {
          ...s,
          leaderPlacement: wantsReserve ? 'substitute' : 'signup',
        };
      })
    );

    setReserveOrder((prev) => {
      const next = prev.filter((id) => {
        if (!removedRoster.includes(id)) return true;
        if (otherSet.has(id)) return true;
        return false;
      });
      for (const id of removedRoster) {
        if (otherSet.has(id)) continue;
        const row = rowById.get(id);
        if (row?.signupType === 'reserve' && !next.includes(id)) {
          next.push(id);
        }
      }
      return next;
    });

    setPlannerGroups(nextGroups);
  }

  async function doAnnounceRaid() {
    if (raidStatus !== 'open' || saving) return;
    if (signups.some((s) => s.id.startsWith('manual:'))) {
      setSaveError(tRoster('announceSaveManualFirst'));
      return;
    }
    const rosterFlat = allRosterIds(plannerGroups);
    for (const rid of rosterFlat) {
      const row = byId.get(rid);
      const uid = (row?.userId ?? '').trim();
      if (!uid) continue;
      if (findUserRosterConflict(plannerGroups, byId, rid, uid)) {
        setSaveError(tRoster('saveErrorDiscordMultiGroup'));
        return;
      }
    }
    if (!window.confirm(tRoster('announceConfirm'))) return;
    setSaving(true);
    setSaveError(null);
    try {
      const rosterSetAnnounce = new Set(rosterFlat);
      const forbidReserveAnnounce = new Map(signups.map((s) => [s.id, !!s.forbidReserve]));
      const announcePolicy = applyPlannerUnsetPolicy({
        allSignupIds: signups.map((s) => s.id),
        rosterIdSet: rosterSetAnnounce,
        reserveOrder: orderedReserveSignupIdsForDisplay(
          reserveOrder,
          signups.map((s) => ({ id: s.id, type: s.signupType }))
        ).filter((id) => !rosterSetAnnounce.has(id)),
        declineOrder,
        forbidReserveById: forbidReserveAnnounce,
        unsetPlayersMode,
      });
      const reserveOrderPayload = announcePolicy.reserveOrder;
      const declineOrderPayload = announcePolicy.declineOrder;

      const res = await fetch(
        `/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'announce',
            groups: syncPlannerGroupsParties(plannerGroups).map((g) => ({
              rosterOrder: g.rosterOrder,
              raidLeaderUserId: g.raidLeaderUserId,
              lootmasterUserId: g.lootmasterUserId,
              partySlots: g.partySlots,
            })),
            reserveOrder: reserveOrderPayload,
            declineOrder: declineOrderPayload,
            unsetPlayersMode,
          }),
        }
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(formatSignupApiErrorPayload(txt) || tRoster('announceError'));
      }
      setReserveOrder(reserveOrderPayload);
      setDeclineOrder(declineOrderPayload);
      router.push(`/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`);
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
    setDeclineOrder(savedSnapshot.declineOrder);
    setLeaderNotesHtml(savedSnapshot.leaderNotesHtml);
    setNotesBootstrapKey((k) => k + 1);
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
          'rounded-xl border border-border bg-card/40 shadow-sm overflow-hidden transition-opacity duration-200',
          dragActive && 'opacity-35 pointer-events-none'
        )}
      >
        <div className="relative px-4 py-3 sm:px-5 sm:py-4 pr-14 sm:pr-16">
          <button
            type="button"
            className="absolute top-3 right-3 sm:top-4 sm:right-4 shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background hover:bg-muted"
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
          <div className="min-w-0 space-y-1.5 pr-1">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{raid.name}</h1>
            <p className="text-sm text-foreground/90">{raid.dungeonLabel}</p>
            <p className="text-sm text-foreground/90">
              <span className="text-muted-foreground">{tRoster('metaTermin')}</span>{' '}
              {raidTermin}
            </p>
            <p className="text-sm text-foreground/90">
              <span className="text-muted-foreground">{tRoster('metaOrganizer')}</span>{' '}
              {organizerLabel ?? tRoster('organizerUnset')}
            </p>
          </div>
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

      <div
        className={cn(
          'transition-opacity duration-200',
          dragActive && 'opacity-35 pointer-events-none'
        )}
      >
        <PlannerLeaderNotesCollapsible
          bootstrapKey={notesBootstrapKey}
          bootstrapHtml={leaderNotesHtml}
          bodyHtmlForPreview={leaderNotesHtml}
          expanded={leaderNotesExpanded}
          onExpandedChange={setLeaderNotesExpanded}
          onHtmlChange={setLeaderNotesHtml}
          disabled={!canEditRaid}
          labels={{
            title: tRoster('leaderPlanNotes'),
            expand: tRoster('leaderPlanNotesExpand'),
            collapse: tRoster('leaderPlanNotesCollapse'),
            bold: tRoster('richBold'),
            italic: tRoster('richItalic'),
            underline: tRoster('richUnderline'),
            bullets: tRoster('richBullets'),
            hint: tRoster('leaderPlanNotesHint'),
          }}
        />
      </div>

      <section
        aria-label={tRoster('actions')}
        className={cn(
          'rounded-xl border border-border bg-card/40 shadow-sm px-4 py-3 transition-opacity duration-200',
          dragActive && 'opacity-35 pointer-events-none'
        )}
      >
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 items-center">
          <div className="flex flex-wrap items-center gap-2 sm:justify-self-start">
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

          <div className="flex justify-center order-first sm:order-none">
            <button
              type="button"
              onClick={() => setAllSignupNotesOpen(true)}
              disabled={signupsWithNotesList.length === 0}
              className={cn(
                'rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors',
                signupsWithNotesList.length === 0 && 'opacity-50 cursor-not-allowed'
              )}
              title={tRoster('allSignupNotes')}
            >
              {tRoster('allSignupNotes')}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-self-end justify-end">
            <button
              type="button"
              onClick={() => void doAnnounceRaid()}
              disabled={saving || raidStatus !== 'open'}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-semibold transition-colors',
                'bg-emerald-600 text-white hover:bg-emerald-700',
                'dark:bg-emerald-500 dark:hover:bg-emerald-600',
                (saving || raidStatus !== 'open') && 'opacity-60 cursor-not-allowed'
              )}
              title={tRoster('announce')}
            >
              {tRoster('announce')}
            </button>

            <button
              type="button"
              onClick={() => setCancelDmOpen(true)}
              disabled={saving || !defaultCancelDmText}
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
            <div
              data-drop-zone="decline"
              className={cn(
                'rounded-xl border border-border bg-card/40 shadow-sm overflow-hidden transition-[box-shadow] duration-200',
                dragActive && 'ring-2 ring-destructive/40 ring-offset-2 ring-offset-background'
              )}
            >
              <button
                type="button"
                onClick={() => setDeclineBlockOpen((v) => !v)}
                className="w-full border-b border-border bg-muted/20 px-4 py-3 flex items-center justify-between gap-2 text-left hover:bg-muted/30 transition-colors"
                aria-expanded={declineBlockOpen}
              >
                <span className="text-sm font-semibold text-foreground">
                  {tRoster('declineBlockTitle')}
                </span>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {declineBlockOpen
                    ? tRoster('declineBlockCollapse')
                    : tRoster('declineBlockExpand', { count: declineBlockFilteredIds.length })}
                </span>
              </button>
              {declineBlockOpen ? (
                <div className="p-3 space-y-3 min-h-[72px]">
                  {declineBlockFilteredIds.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{tRoster('declineBlockEmpty')}</p>
                  ) : (
                    ROLE_ORDER.map((role) => {
                      const ids = declineBlockByRole.get(role) ?? [];
                      if (ids.length === 0) return null;
                      return (
                        <div key={`decline-${role}`}>
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
                    })
                  )}
                </div>
              ) : (
                <div className="px-4 py-2 text-xs text-muted-foreground min-h-[40px] flex items-center">
                  {declineBlockFilteredIds.length > 0
                    ? tRoster('declineBlockCollapsedHint', {
                        count: declineBlockFilteredIds.length,
                      })
                    : tRoster('declineBlockEmpty')}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() =>
                setPlannerGroups((prev) => [
                  ...prev,
                  applyPartyLayoutToGroup(
                    {
                      rosterOrder: [],
                      raidLeaderUserId: null,
                      lootmasterUserId: null,
                      partySlots: [],
                    },
                    raid.maxPlayers
                  ),
                ])
              }
              className="w-full rounded-lg border border-dashed border-border bg-muted/10 px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/30 transition-colors"
            >
              {tRoster('addGroup')}
            </button>

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

              const groupCharNames = group.rosterOrder
                .map((id) => byId.get(id)?.name?.trim())
                .filter((n): n is string => !!n);

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
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <h2 className="text-sm font-semibold text-foreground">
                          {tRoster('groupTitle', { n: groupIndex + 1 })}
                        </h2>
                        <GroupCharNamesExport names={groupCharNames} />
                        {plannerGroups.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removePlannerGroupAt(groupIndex)}
                            className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
                            title={tRoster('removeGroup')}
                          >
                            {tRoster('removeGroup')}
                          </button>
                        ) : null}
                      </div>
                      <div className={cn('text-lg font-bold tabular-nums leading-none', toneForFulfillment(gRatio))}>
                        {group.rosterOrder.length} / {raid.maxPlayers}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
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
                          {leaderLootUserIds.map((uid) => (
                            <option key={`${groupIndex}-rl-${uid}`} value={uid}>
                              {formatLeaderLootOptionLabel(uid, group.rosterOrder)}
                            </option>
                          ))}
                        </select>
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
                          {leaderLootUserIds.map((uid) => (
                            <option key={`${groupIndex}-lm-${uid}`} value={uid}>
                              {formatLeaderLootOptionLabel(uid, group.rosterOrder)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
                      {ROLE_KEYS.map((roleKey) => {
                        const need = overviewProps.roleMinByKey[roleKey] ?? 0;
                        const cur = gRoleCounts[roleKey] ?? 0;
                        return (
                          <span key={roleKey} className="inline-flex items-center gap-1.5 text-muted-foreground">
                            <RoleIcon role={roleKey} size={16} />
                            <span className={cn('font-semibold tabular-nums', minCountTone(cur, need))}>
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
                              const needN = typeof need === 'number' ? need : 0;
                              return (
                                <span
                                  key={specKey}
                                  className="inline-flex items-center gap-1.5 text-muted-foreground"
                                  title={title}
                                >
                                  {classId ? (
                                    <ClassIcon classId={classId} size={16} title={title} />
                                  ) : (
                                    <SpecIcon spec={specKey} size={16} />
                                  )}
                                  <span className={cn('font-semibold tabular-nums', minCountTone(cur, needN))}>
                                    {countToMinLabel(cur, needN)}
                                  </span>
                                </span>
                              );
                            })
                        : null}
                    </div>
                  </div>
                  <PlannerPartyInline
                    groupIndex={groupIndex}
                    partySlots={group.partySlots}
                    tPartyTitle={(n) => tRoster('partyTitle', { n })}
                    renderSignup={(signupId, _pi, cellIndex) => {
                      const s = byId.get(signupId);
                      if (!s) return null;
                      return renderRow(s, 'roster', cellIndex);
                    }}
                  />
                </div>
              );
            })}

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
                {filteredReserveIds.length === 0 && reserveBenchOrderedIds.length > 0 ? (
                  <p className="text-sm text-muted-foreground px-1 py-2">{tRoster('reserveFilteredEmpty')}</p>
                ) : null}
                {reserveBenchOrderedIds.length === 0 ? (
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
            <div className="p-3 space-y-4">
              {ROLE_ORDER.map((role) => {
                const ids = standardPoolByRole.get(role) ?? [];
                if (ids.length === 0) return null;
                return (
                  <div key={`std-${role}`}>
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
              {uncertainPoolIds.length > 0 ? (
                <div
                  className={cn(
                    'space-y-3',
                    standardPoolIds.length > 0 ? 'border-t border-border pt-4' : 'pt-1'
                  )}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {tRoster('sectionUncertainSignups')}
                  </p>
                  {ROLE_ORDER.map((role) => {
                    const ids = uncertainPoolByRole.get(role) ?? [];
                    if (ids.length === 0) return null;
                    return (
                      <div key={`unc-${role}`}>
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
                </div>
              ) : null}
              {declinedPoolIds.length > 0 ? (
                <div
                  className={cn(
                    'space-y-3',
                    standardPoolIds.length > 0 || uncertainPoolIds.length > 0
                      ? 'border-t border-border pt-4'
                      : 'pt-1'
                  )}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {tRoster('sectionDeclinedSignups')}
                  </p>
                  {ROLE_ORDER.map((role) => {
                    const ids = declinedPoolByRole.get(role) ?? [];
                    if (ids.length === 0) return null;
                    return (
                      <div key={`dec-${role}`}>
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
                </div>
              ) : null}
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

              <div className="space-y-1.5 pt-1">
                <span className="text-muted-foreground text-xs">{tRoster('filterAttendance')}</span>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['bin_da', tRoster('filterAttendanceBinDa'), '✅'] as const,
                      ['unklar', tRoster('filterAttendanceUnklar'), '❔'] as const,
                      ['nicht_da', tRoster('filterAttendanceNichtDa'), '🚫'] as const,
                    ] as const
                  ).map(([k, label, icon]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => toggleAttendance(k)}
                      className={cn(
                        'rounded-lg border px-2 py-1.5 text-xs sm:text-sm flex items-center gap-1.5 justify-start min-w-0',
                        attendanceFilter[k]
                          ? 'border-primary/50 bg-primary/10 text-foreground'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                      )}
                      aria-pressed={attendanceFilter[k]}
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

          {comparisonOpen ? (
            <div className="w-full xl:w-72 rounded-xl border border-border bg-muted/15 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                <p className="text-sm font-medium">{tRoster('comparisonRaidTitle')}</p>
                <button
                  type="button"
                  onClick={() => setComparisonOpen(false)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted"
                  aria-label={tRoster('comparisonRaidTitle')}
                >
                  ◀
                </button>
              </div>

              <div className="flex rounded-lg border border-border p-0.5 bg-muted/30">
                <button
                  type="button"
                  onClick={() => setComparisonEnabled(false)}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-sm flex-1',
                    !comparisonEnabled
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {tRoster('comparisonOff')}
                </button>
                <button
                  type="button"
                  onClick={() => setComparisonEnabled(true)}
                  disabled={!comparisonRaidId}
                  className={cn(
                    'rounded-md px-2.5 py-1.5 text-sm flex-1',
                    comparisonEnabled
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted',
                    !comparisonRaidId && 'opacity-50 cursor-not-allowed'
                  )}
                >
                  {tRoster('comparisonOn')}
                </button>
              </div>

              {comparisonEnabled && comparisonRaidLabel ? (
                <p className="text-xs text-muted-foreground truncate" title={comparisonRaidLabel}>
                  {comparisonRaidLabel}
                </p>
              ) : null}

              {comparisonEnabled ? (
                <div className="flex flex-wrap gap-2 text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-emerald-500/80" />
                    {tRoster('comparisonLegendConfirmed')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-amber-500/80" />
                    {tRoster('comparisonLegendReserve')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-sky-500/80" />
                    {tRoster('comparisonLegendSignup')}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-sm bg-violet-500/80" />
                    {tRoster('comparisonLegendUncertain')}
                  </span>
                </div>
              ) : null}

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={comparisonListLoading || !comparisonHasOlder}
                  onClick={() => {
                    const before =
                      comparisonCursorBefore ??
                      comparisonTodayStart ??
                      new Date().toISOString();
                    void loadComparisonRaids({ before });
                  }}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted disabled:opacity-40"
                >
                  {tRoster('comparisonPagePrev')}
                </button>
                <button
                  type="button"
                  disabled={comparisonListLoading || !comparisonHasNewer}
                  onClick={() => {
                    const after =
                      comparisonCursorAfter ??
                      comparisonTodayStart ??
                      new Date().toISOString();
                    void loadComparisonRaids({ after });
                  }}
                  className="rounded-md border border-border bg-background px-2 py-1 text-xs hover:bg-muted disabled:opacity-40"
                >
                  {tRoster('comparisonPageNext')}
                </button>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1.5">
                {comparisonListLoading ? (
                  <p className="text-xs text-muted-foreground">{tPlanner('loading')}</p>
                ) : comparisonList.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{tRoster('comparisonListEmpty')}</p>
                ) : (
                  comparisonList.map((r) => {
                    const selected = comparisonRaidId === r.id;
                    const dateStr = new Date(r.scheduledAt).toLocaleString(intlLocale, {
                      weekday: 'short',
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const statusLabel = t(`raidStatus_${r.status}`);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => {
                          setComparisonRaidId(r.id);
                          setComparisonRaidLabel(`${r.name} · ${dateStr}`);
                          if (!comparisonEnabled) setComparisonEnabled(true);
                        }}
                        className={cn(
                          'w-full text-left rounded-lg border px-2.5 py-2 text-xs transition-colors',
                          selected
                            ? 'border-primary/60 bg-primary/10'
                            : 'border-border bg-background hover:bg-muted/40'
                        )}
                      >
                        <p className="font-medium text-foreground truncate">{r.name}</p>
                        <p className="text-muted-foreground mt-0.5">{dateStr}</p>
                        <p className="text-muted-foreground truncate">{r.dungeonLabel}</p>
                        <p className="text-muted-foreground/80 mt-0.5">{statusLabel}</p>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setComparisonOpen(true)}
              className="w-full xl:w-10 rounded-xl border border-border bg-muted/15 py-4 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/25"
              aria-label={tRoster('comparisonRaidTitle')}
              title={tRoster('comparisonRaidTitle')}
            >
              <span className="block xl:[writing-mode:vertical-rl] xl:rotate-180">
                {tRoster('comparisonRaidTitle')}
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
                {raidStatus !== 'cancelled' &&
                raidStatus !== 'completed' &&
                (raidStatus === 'open' || raidStatus === 'announced' || raidStatus === 'locked') ? (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted"
                    onClick={() => {
                      setLeaderMenuOpen(false);
                      router.push(`/${locale}/guild/${guildId}/raid/${raidId}/complete`);
                    }}
                  >
                    {t('menuCompleteRaid')}
                  </button>
                ) : null}
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
                  {t('modeEdit')}
                </button>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted"
                  onClick={() => {
                    setLeaderMenuOpen(false);
                    setCancelDmOpen(true);
                  }}
                >
                  {t('menuCancelRaid')}
                </button>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    setLeaderMenuOpen(false);
                    void doDeleteRaid();
                  }}
                >
                  {t('menuDeleteRaid')}
                </button>
              </div>
            </>,
            document.body
          )
        : null}

      {floatingSignupNote
        ? createPortal(
            <div
              ref={floatingNotePanelRef}
              className="fixed z-[1220] w-[min(100vw-16px,300px)] max-h-[min(70vh,420px)] overflow-y-auto rounded-lg border border-border bg-background shadow-2xl text-sm pointer-events-auto"
              style={{ left: floatingSignupNote.left, top: floatingSignupNote.top }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
                <span className="text-xs font-semibold text-foreground">{t('participantNotiz')}</span>
                <button
                  type="button"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-background hover:bg-muted shrink-0 text-xs"
                  onClick={() => setFloatingSignupNote(null)}
                  aria-label={tPlanner('cancel')}
                  title={tPlanner('cancel')}
                >
                  ✕
                </button>
              </div>
              <div className="p-3 space-y-2">
                <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
                  <span className="text-muted-foreground">{tRoster('columnPlayer')}</span>
                  <span className="font-medium text-foreground break-words">{floatingSignupNote.playerLabel}</span>
                  <span className="text-muted-foreground">{tRoster('columnChar')}</span>
                  <span className="font-medium text-foreground break-words">{floatingSignupNote.charName}</span>
                  <span className="text-muted-foreground">{tRoster('columnPunctuality')}</span>
                  <span className="text-foreground">{floatingSignupNote.punctualityLabel}</span>
                </div>
                <div className="rounded-md border border-border bg-muted/15 p-2 text-sm whitespace-pre-wrap break-words">
                  {floatingSignupNote.note}
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {allSignupNotesOpen
        ? createPortal(
            <div className="fixed inset-0 z-[1215] flex items-start justify-center p-4 sm:p-8 pt-14 sm:pt-20">
              <button
                type="button"
                className="absolute inset-0 bg-black/45 cursor-default border-0 p-0"
                aria-label={tRoster('closeOverlay')}
                onClick={() => setAllSignupNotesOpen(false)}
              />
              <div
                className="relative w-full max-w-3xl max-h-[min(85vh,640px)] flex flex-col rounded-xl border border-border bg-background shadow-2xl overflow-hidden"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3 shrink-0">
                  <h2 className="text-sm font-semibold text-foreground">{tRoster('allSignupNotesTitle')}</h2>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-muted shrink-0"
                    onClick={() => setAllSignupNotesOpen(false)}
                    aria-label={tRoster('closeOverlay')}
                    title={tRoster('closeOverlay')}
                  >
                    ✕
                  </button>
                </div>
                <div className="overflow-auto flex-1 p-3">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-3 font-medium">{tRoster('columnPlayer')}</th>
                        <th className="py-2 pr-3 font-medium">{tRoster('columnChar')}</th>
                        <th className="py-2 pr-3 font-medium whitespace-nowrap">{tRoster('columnPunctuality')}</th>
                        <th className="py-2 font-medium">{tRoster('columnNote')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {signupsWithNotesList.map((row) => (
                        <tr key={row.id} className="border-b border-border/70 align-top">
                          <td className="py-2 pr-3 break-words max-w-[140px]">{row.playerLabel}</td>
                          <td className="py-2 pr-3 break-words max-w-[140px]">{row.charName}</td>
                          <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{row.punctualityLabel}</td>
                          <td className="py-2 whitespace-pre-wrap break-words">{row.note}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {dragSession && dragPoint && draggedSignup
        ? (() => {
            const dv = attendanceRowVariant(draggedSignup);
            return createPortal(
              <div
                className={cn(
                  'pointer-events-none fixed z-[1100] rounded-lg border bg-background px-2 py-1.5 text-sm shadow-xl flex flex-wrap items-center gap-2',
                  dv === 'default' && 'border-primary',
                  dv === 'uncertain' && 'border-red-400/60 dark:border-red-700/55',
                  dv === 'declined' &&
                    'border-red-400/60 dark:border-red-800/50 bg-red-500/[0.09] dark:bg-red-950/40'
                )}
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
            );
          })()
        : null}

      {dragQuickMenuActive && quickMenuLayout
        ? createPortal(
            <div
              className="fixed z-[1300] pointer-events-none"
              style={{
                left: quickMenuLayout.menuLeft,
                top: quickMenuLayout.menuTop,
                transform: 'translate(-50%, calc(-100% - 12px))',
              }}
            >
              <div className="flex items-center justify-center gap-2.5 pointer-events-auto rounded-2xl border border-border/80 bg-background/95 px-2 py-2 shadow-xl backdrop-blur-sm">
                <button
                  type="button"
                  data-quick-drop="decline"
                  className="rounded-full border-2 border-red-700 bg-red-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-red-700 active:scale-95 whitespace-nowrap"
                >
                  {tRoster('quickDropDecline')}
                </button>
                <button
                  type="button"
                  data-quick-drop="pool"
                  className="rounded-full border-2 border-sky-700 bg-sky-600 px-4 py-2.5 text-xs font-bold text-white shadow-md hover:bg-sky-700 active:scale-95 whitespace-nowrap"
                >
                  {tRoster('quickDropSignup')}
                </button>
                <button
                  type="button"
                  data-quick-drop="reserve"
                  className="rounded-full border-2 border-amber-700 bg-amber-500 px-4 py-2.5 text-xs font-bold text-amber-950 shadow-md hover:bg-amber-400 active:scale-95 whitespace-nowrap"
                >
                  {tRoster('quickDropReserve')}
                </button>
              </div>
            </div>,
            document.body
          )
        : null}

      {flyBack && byId.get(flyBack.signupId)
        ? (() => {
            const s = byId.get(flyBack.signupId)!;
            const fv = attendanceRowVariant(s);
            return createPortal(
              <div
                ref={flyBackRef}
                className={cn(
                  'fixed z-[1100] pointer-events-none rounded-lg border bg-background shadow-lg flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm',
                  fv === 'default' && 'border-border',
                  fv === 'uncertain' && 'border-red-400/60 dark:border-red-700/55',
                  fv === 'declined' &&
                    'border-red-400/60 dark:border-red-800/50 bg-red-500/[0.09] dark:bg-red-950/40'
                )}
                style={{
                  left: flyBack.fromLeft,
                  top: flyBack.fromTop,
                  width: flyBack.width,
                  minHeight: flyBack.height,
                }}
              >
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
              </div>,
              document.body
            );
          })()
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
                            const displayDiscordName = resolveDiscordNameForCharacterOption(c);
                            const displayGearScore = resolveGearScoreForCharacterOption(c);
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
                                    offSpecWrapperBaseClassName="inline-flex items-center align-middle"
                                    offSpecIconClassName="grayscale contrast-200 brightness-75"
                                  />
                                </span>
                                <span className="font-medium truncate">{c.name}</span>
                                <span className="ml-auto flex items-center gap-2">
                                  <CharacterDiscordPill discordName={displayDiscordName} />
                                  <CharacterGearscorePill gearScore={displayGearScore} />
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
      <RaidCancelDiscordOverlay
        open={cancelDmOpen}
        defaultMessage={defaultCancelDmText}
        onClose={() => !cancelDmBusy && setCancelDmOpen(false)}
        onConfirm={submitRaidCancelFromOverlay}
        busy={cancelDmBusy}
        title={tCancelDm('overlayTitle')}
        hintMarkdown={tCancelDm('overlayHint')}
        editorLabel={tCancelDm('editorLabel')}
        previewLabel={tCancelDm('previewLabel')}
        resetLabel={tCancelDm('resetDefault')}
        cancelLabel={tCancelDm('cancel')}
        confirmLabel={tCancelDm('confirm')}
      />
    </div>
  );
}
