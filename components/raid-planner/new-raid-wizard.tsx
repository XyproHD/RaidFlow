'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { TIME_SLOTS_30MIN } from '@/lib/profile-constants';
import {
  availabilityColorForRaidWindow,
  dateToRfWeekday,
  specFulfillmentRatio,
  toneForSlot,
  type PrefSlot,
  type SlotHeat,
} from '@/lib/raid-availability';
import {
  countFromSpecDisplayCounts,
  MIN_SPEC_CLASS_ONLY,
  minSpecRowFromStorageKey,
  minSpecRowSpecDisplayName,
  minSpecRowToStorageKey,
  minSpecRowUsesClassIconOnly,
  normalizeMinSpecRow,
  type MinSpecRowForm,
} from '@/lib/min-spec-keys';
import { getSpecByDisplayName, TBC_CLASS_IDS, type TbcRole } from '@/lib/wow-tbc-classes';
import {
  addMinutes,
  expandSlotIndicesForward,
  localDateTimeToNearestRaidBaseAndSlotIndex,
  raidSlotToLocalDate,
  slotStringsForIndices,
} from '@/lib/raid-planner-time';
import { ClassIcon } from '@/components/class-icon';
import { SpecIcon } from '@/components/spec-icon';
import { RoleIcon } from '@/components/role-icon';
import { CharacterMainStar } from '@/components/character-main-star';
import { CharacterGearscoreBadge } from '@/components/character-gearscore-badge';
import { BattlenetLogo } from '@/components/battlenet-logo';
import { CharacterSpecIconsInline } from '@/components/character-display-parts';
import { MinSpecRequirementRow } from '@/components/raid-planner/min-spec-requirement-row';

const ROLE_ORDER: TbcRole[] = ['Tank', 'Healer', 'Melee', 'Range'];
/** i18n keys under `raidPlanner` für Klassen-Filter-Buttons */
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
const SLOTS = TIME_SLOTS_30MIN as readonly string[];
const DEFAULT_SLOT_IDX = Math.max(0, SLOTS.indexOf('19:00'));

type GroupCharRule = { raidGroupId: string; characterId: string; allowed: boolean };

type PoolCharacter = {
  id: string;
  name: string;
  mainSpec: string;
  offSpec: string | null;
  isMain: boolean;
  gearScore?: number | null;
  classId: string | null;
  specId: string | null;
  role: TbcRole | null;
  guildDiscordDisplayName?: string | null;
  hasBattlenet?: boolean;
};

type PoolMember = {
  userId: string;
  roleInGuild: string;
  weekFocus: string | null;
  raidTimeSlots: PrefSlot[];
  raidGroupIds: string[];
  characters: PoolCharacter[];
};

function poolCharacterClassId(c: PoolCharacter): string | null {
  if (c.classId) return c.classId;
  return getSpecByDisplayName(c.mainSpec)?.classId ?? null;
}

type Bootstrap = {
  dungeons: { id: string; name: string; maxPlayers: number }[];
  raidGroups: { id: string; name: string }[];
  allowedChannels: { id: string; discordChannelId: string; name: string | null }[];
  leaders: { userId: string; label: string }[];
  groupCharAllowed: GroupCharRule[];
  members: PoolMember[];
};

type RowColor = 'green' | 'orange' | 'gray';
type MainAltFilter = 'mains' | 'both' | 'twinks';
type AvailabilityFilter = 'all' | 'available' | 'limited' | 'unavailable';

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function parseDatetimeLocal(s: string): Date {
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** Anmeldung „offen bis“: Standard 4 Tage vor Raidbeginn, immer strikt vor dem Raidtermin. */
function suggestedSignupBeforeRaid(raidStart: Date): Date {
  const fourDaysMs = 4 * 24 * 60 * 60 * 1000;
  const oneHourMs = 60 * 60 * 1000;
  let candidate = new Date(raidStart.getTime() - fourDaysMs);
  const latest = new Date(raidStart.getTime() - oneHourMs);
  const now = new Date();
  if (candidate.getTime() > latest.getTime()) candidate = latest;
  if (candidate.getTime() < now.getTime()) {
    candidate = new Date(Math.min(now.getTime() + 5 * 60 * 1000, latest.getTime()));
  }
  if (candidate.getTime() >= raidStart.getTime()) {
    candidate = latest;
  }
  return candidate;
}

function defaultCreateScheduledYmd(): string {
  const t0 = new Date();
  const y = t0.getFullYear();
  const m = String(t0.getMonth() + 1).padStart(2, '0');
  const d = String(t0.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function charAllowedInRestrictedGroup(
  charId: string,
  member: PoolMember,
  restrictionId: string,
  rules: GroupCharRule[]
): boolean {
  if (!member.raidGroupIds.includes(restrictionId)) return false;
  const row = rules.find((r) => r.raidGroupId === restrictionId && r.characterId === charId);
  if (row && row.allowed === false) return false;
  return true;
}

function memberPassesWeekFocus(m: PoolMember, allowWeekday: boolean, allowWeekend: boolean): boolean {
  if (m.weekFocus == null) return true;
  if (m.weekFocus === 'weekday') return allowWeekday;
  if (m.weekFocus === 'weekend') return allowWeekend;
  return true;
}

function heatClass(h: SlotHeat): string {
  switch (h) {
    case 'green':
      return 'bg-emerald-500/45 border-emerald-600/60';
    case 'yellow':
      return 'bg-yellow-400/50 border-yellow-600/55';
    case 'orange':
      return 'bg-orange-500/45 border-orange-600/60';
    default:
      return 'bg-red-500/40 border-red-600/55';
  }
}

export function NewRaidWizard({
  guildId,
  currentUserId,
  mode = 'create',
  raidId,
  initialRaid,
}: {
  guildId: string;
  currentUserId: string;
  mode?: 'create' | 'edit';
  raidId?: string;
  initialRaid?: {
    id: string;
    dungeonId: string;
    dungeonIds: string[] | null;
    name: string;
    note: string | null;
    raidLeaderId: string | null;
    lootmasterId: string | null;
    minTanks: number;
    minMelee: number;
    minRange: number;
    minHealers: number;
    minSpecs: unknown;
    raidGroupRestrictionId: string | null;
    maxPlayers: number;
    scheduledAt: string;
    scheduledEndAt: string | null;
    signupUntil: string;
    signupVisibility: string;
    discordThreadId: string | null;
    discordChannelId: string | null;
    discordLeaderChannelId?: string | null;
    status: string;
  };
}) {
  const t = useTranslations('raidPlanner');
  const tEdit = useTranslations('raidEdit');
  const tDetail = useTranslations('raidDetail');
  const tProfile = useTranslations('profile');
  const locale = useLocale();
  const router = useRouter();

  /** Verfügbarkeits-Ansicht nur über Button; Abbrechen stellt Snapshot wieder her. */
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [portalMounted, setPortalMounted] = useState(false);
  const [scheduleSnapshot, setScheduleSnapshot] = useState<null | {
    scheduledDate: string;
    rangeStartIdx: number;
    rangeEndIdx: number;
    pickingEnd: boolean;
    signupDatetimeLocal: string;
  }>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetAck, setResetAck] = useState(false);

  const [data, setData] = useState<Bootstrap | null>(null);

  const [dungeonIds, setDungeonIds] = useState<string[]>(() => {
    if (mode === 'edit' && initialRaid) {
      const fromJson = Array.isArray(initialRaid.dungeonIds) ? initialRaid.dungeonIds : [];
      return Array.from(new Set([initialRaid.dungeonId, ...fromJson].filter(Boolean)));
    }
    return [];
  });
  const [dungeonMenuOpen, setDungeonMenuOpen] = useState(false);
  const [name, setName] = useState(() => (mode === 'edit' && initialRaid ? initialRaid.name : ''));
  const [note, setNote] = useState(() => (mode === 'edit' && initialRaid ? initialRaid.note ?? '' : ''));
  const [raidLeaderId, setRaidLeaderId] = useState(() =>
    mode === 'edit' && initialRaid ? (initialRaid.raidLeaderId ?? '') : currentUserId
  );
  const [lootmasterId, setLootmasterId] = useState<string>(() =>
    mode === 'edit' && initialRaid ? (initialRaid.lootmasterId ?? '') : ''
  );
  const [minTanks, setMinTanks] = useState(() => (mode === 'edit' && initialRaid ? initialRaid.minTanks : 1));
  const [minMelee, setMinMelee] = useState(() => (mode === 'edit' && initialRaid ? initialRaid.minMelee : 0));
  const [minRange, setMinRange] = useState(() => (mode === 'edit' && initialRaid ? initialRaid.minRange : 0));
  const [minHealers, setMinHealers] = useState(() => (mode === 'edit' && initialRaid ? initialRaid.minHealers : 0));
  const [minSpecRows, setMinSpecRows] = useState<MinSpecRowForm[]>(() => {
    if (
      mode === 'edit' &&
      initialRaid &&
      initialRaid.minSpecs &&
      typeof initialRaid.minSpecs === 'object' &&
      !Array.isArray(initialRaid.minSpecs)
    ) {
      const src = initialRaid.minSpecs as Record<string, number>;
      return Object.entries(src).map(([key, count]) => minSpecRowFromStorageKey(key, count));
    }
    return [];
  });
  const [raidGroupRestrictionId, setRaidGroupRestrictionId] = useState(() =>
    mode === 'edit' && initialRaid ? (initialRaid.raidGroupRestrictionId ?? '') : ''
  );
  const [maxPlayers, setMaxPlayers] = useState(() => (mode === 'edit' && initialRaid ? initialRaid.maxPlayers : 25));
  const [scheduledDate, setScheduledDate] = useState(() => {
    if (mode === 'edit' && initialRaid) {
      const d = new Date(initialRaid.scheduledAt);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    }
    return defaultCreateScheduledYmd();
  });
  const [signupDatetimeLocal, setSignupDatetimeLocal] = useState(() => {
    if (mode === 'edit' && initialRaid) return toDatetimeLocalValue(parseDatetimeLocal(initialRaid.signupUntil));
    const raidStart = raidSlotToLocalDate(
      defaultCreateScheduledYmd(),
      SLOTS[DEFAULT_SLOT_IDX] ?? '19:00'
    );
    return toDatetimeLocalValue(suggestedSignupBeforeRaid(raidStart));
  });
  const [signupVisibility, setSignupVisibility] = useState<'public' | 'raid_leader_only'>(() => {
    if (mode === 'edit' && initialRaid) return initialRaid.signupVisibility === 'raid_leader_only' ? 'raid_leader_only' : 'public';
    return 'public';
  });
  const [discordChannelId, setDiscordChannelId] = useState(() =>
    mode === 'edit' && initialRaid ? (initialRaid.discordChannelId ?? '') : ''
  );
  const [discordLeaderChannelId, setDiscordLeaderChannelId] = useState(() =>
    mode === 'edit' && initialRaid ? (initialRaid.discordLeaderChannelId ?? '') : ''
  );

  const [rangeStartIdx, setRangeStartIdx] = useState(() => {
    if (mode === 'edit' && initialRaid) {
      const s = new Date(initialRaid.scheduledAt);
      const slot = `${String(s.getHours()).padStart(2, '0')}:${String(s.getMinutes()).padStart(2, '0')}`;
      return Math.max(0, SLOTS.indexOf(slot));
    }
    return DEFAULT_SLOT_IDX;
  });
  const [rangeEndIdx, setRangeEndIdx] = useState(() => {
    if (mode === 'edit' && initialRaid) {
      const end = initialRaid.scheduledEndAt ? new Date(initialRaid.scheduledEndAt) : addMinutes(new Date(initialRaid.scheduledAt), 30);
      const endMinus = addMinutes(end, -30);
      const slot = `${String(endMinus.getHours()).padStart(2, '0')}:${String(endMinus.getMinutes()).padStart(2, '0')}`;
      return Math.max(0, SLOTS.indexOf(slot));
    }
    return DEFAULT_SLOT_IDX;
  });
  const [pickingEnd, setPickingEnd] = useState(false);

  const [mainAltFilter, setMainAltFilter] = useState<MainAltFilter>('mains');
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
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('all');

  const editable = mode === 'create' ? true : (initialRaid?.status === 'open');

  useEffect(() => {
    if (!dungeonMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDungeonMenuOpen(false);
    };
    const onDown = () => setDungeonMenuOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onDown, true);
    };
  }, [dungeonMenuOpen]);

  const signupUntil = useMemo(() => parseDatetimeLocal(signupDatetimeLocal), [signupDatetimeLocal]);

  const rangeIndices = useMemo(() => {
    if (pickingEnd) return [rangeStartIdx];
    return expandSlotIndicesForward(rangeStartIdx, rangeEndIdx);
  }, [rangeStartIdx, rangeEndIdx, pickingEnd]);

  const rangeSlotStrings = useMemo(
    () => slotStringsForIndices(rangeIndices),
    [rangeIndices]
  );

  const scheduledAt = useMemo(
    () => raidSlotToLocalDate(scheduledDate, rangeSlotStrings[0] ?? '19:00'),
    [scheduledDate, rangeSlotStrings]
  );

  const scheduledEndAt = useMemo(() => {
    const last = rangeSlotStrings[rangeSlotStrings.length - 1] ?? '19:00';
    return addMinutes(raidSlotToLocalDate(scheduledDate, last), 30);
  }, [scheduledDate, rangeSlotStrings]);

  const isEdit = mode === 'edit' && !!raidId && !!initialRaid;
  const initialDungeonIds = useMemo(() => {
    if (!initialRaid) return [];
    return Array.from(new Set([initialRaid.dungeonId, ...(initialRaid.dungeonIds ?? [])].filter(Boolean)));
  }, [initialRaid]);
  const dungeonChanged = useMemo(() => {
    if (!isEdit) return false;
    return JSON.stringify(initialDungeonIds) !== JSON.stringify(dungeonIds);
  }, [isEdit, initialDungeonIds, dungeonIds]);
  const scheduleChanged = useMemo(() => {
    if (!isEdit || !initialRaid) return false;
    const a0 = new Date(initialRaid.scheduledAt).getTime();
    const e0 = (initialRaid.scheduledEndAt ? new Date(initialRaid.scheduledEndAt) : addMinutes(new Date(initialRaid.scheduledAt), 30)).getTime();
    return a0 !== scheduledAt.getTime() || e0 !== scheduledEndAt.getTime();
  }, [isEdit, initialRaid, scheduledAt, scheduledEndAt]);
  const requiresReset = isEdit && (scheduleChanged || dungeonChanged);

  useEffect(() => {
    if (!requiresReset) setResetAck(false);
  }, [requiresReset]);

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/guilds/${guildId}/raid-planner/bootstrap?locale=${encodeURIComponent(locale)}`
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || res.statusText);
      }
      const json = (await res.json()) as Bootstrap;
      setData(json);
      if (json.dungeons.length > 0 && mode !== 'edit') {
        const first = json.dungeons[0]!;
        setDungeonIds([first.id]);
        setMaxPlayers(first.maxPlayers);
      }
      if (json.leaders.some((l) => l.userId === currentUserId)) {
        setRaidLeaderId(currentUserId);
      } else if (json.leaders[0]) {
        setRaidLeaderId(json.leaders[0].userId);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [guildId, locale, currentUserId, mode]);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    setPortalMounted(true);
  }, []);

  const restriction = raidGroupRestrictionId.trim();
  const anyRoleSelected = ROLE_ORDER.some((r) => roleFilter[r]);
  const anyClassSelected = TBC_CLASS_IDS.some((id) => classFilter[id]);

  const playerReps = useMemo(() => {
    if (!data) return [];
    const out: { userId: string; member: PoolMember; character: PoolCharacter }[] = [];
    for (const m of data.members) {
      if (m.roleInGuild === 'member') continue;
      if (!memberPassesWeekFocus(m, allowWeekday, allowWeekend)) continue;
      const eligible = m.characters.filter((c) => {
        if (mainAltFilter === 'mains' && !c.isMain) return false;
        if (mainAltFilter === 'twinks' && c.isMain) return false;
        if (restriction && !charAllowedInRestrictedGroup(c.id, m, restriction, data.groupCharAllowed)) {
          return false;
        }
        if (c.role && anyRoleSelected && !roleFilter[c.role]) return false;
        const cid = poolCharacterClassId(c);
        if (cid && anyClassSelected && !classFilter[cid]) return false;
        return !!c.role;
      });
      if (eligible.length === 0) continue;
      const sorted = [...eligible].sort((a, b) => {
        if (a.isMain !== b.isMain) return a.isMain ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      const character = sorted[0]!;
      out.push({ userId: m.userId, member: m, character });
    }
    return out;
  }, [
    data,
    allowWeekday,
    allowWeekend,
    mainAltFilter,
    restriction,
    roleFilter,
    anyRoleSelected,
    classFilter,
    anyClassSelected,
    raidGroupRestrictionId,
  ]);

  const filteredPool = useMemo(() => {
    if (!data) return [] as { member: PoolMember; character: PoolCharacter; color: RowColor }[];
    const rows: { member: PoolMember; character: PoolCharacter; color: RowColor }[] = [];
    for (const m of data.members) {
      if (m.roleInGuild === 'member') continue;
      if (!memberPassesWeekFocus(m, allowWeekday, allowWeekend)) continue;
      for (const c of m.characters) {
        if (mainAltFilter === 'mains' && !c.isMain) continue;
        if (mainAltFilter === 'twinks' && c.isMain) continue;
        if (restriction && !charAllowedInRestrictedGroup(c.id, m, restriction, data.groupCharAllowed)) {
          continue;
        }
        if (c.role && anyRoleSelected && !roleFilter[c.role]) continue;
        const cid = poolCharacterClassId(c);
        if (cid && anyClassSelected && !classFilter[cid]) continue;
        if (!c.role) continue;
        const color = availabilityColorForRaidWindow(m.raidTimeSlots, scheduledDate, rangeSlotStrings);
        if (availabilityFilter === 'available' && color !== 'green') continue;
        if (availabilityFilter === 'limited' && color !== 'orange') continue;
        if (availabilityFilter === 'unavailable' && color !== 'gray') continue;
        rows.push({ member: m, character: c, color });
      }
    }
    return rows;
  }, [
    data,
    allowWeekday,
    allowWeekend,
    mainAltFilter,
    restriction,
    roleFilter,
    anyRoleSelected,
    classFilter,
    anyClassSelected,
    scheduledDate,
    rangeSlotStrings,
    raidGroupRestrictionId,
    availabilityFilter,
  ]);

  const minSpecRowsFlat = useMemo(
    () =>
      minSpecRows
        .map((r) => {
          const spec = minSpecRowToStorageKey(r);
          return spec && r.count > 0 ? { spec, count: r.count } : null;
        })
        .filter((x): x is { spec: string; count: number } => x !== null),
    [minSpecRows]
  );

  const slotHeat = useMemo((): SlotHeat[] => {
    const activeSpecs = minSpecRowsFlat;
    return SLOTS.map((slotStr, _i) => {
      const wd = dateToRfWeekday(raidSlotToLocalDate(scheduledDate, slotStr));
      const tanks = new Set<string>();
      const melee = new Set<string>();
      const range = new Set<string>();
      const healers = new Set<string>();
      const specCounts: Record<string, number> = {};

      for (const p of playerReps) {
        const tone = toneForSlot(p.member.raidTimeSlots, wd, slotStr);
        if (tone !== 'likely' && tone !== 'maybe') continue;
        const r = p.character.role;
        if (!r) continue;
        if (r === 'Tank') tanks.add(p.userId);
        else if (r === 'Melee') melee.add(p.userId);
        else if (r === 'Range') range.add(p.userId);
        else if (r === 'Healer') healers.add(p.userId);
        const ms = p.character.mainSpec;
        specCounts[ms] = (specCounts[ms] ?? 0) + 1;
      }

      const rolesMet =
        tanks.size >= minTanks &&
        melee.size >= minMelee &&
        range.size >= minRange &&
        healers.size >= minHealers;

      const ratio = specFulfillmentRatio(specCounts, minSpecRowsFlat);

      if (!rolesMet) return 'yellow';
      if (activeSpecs.length === 0) return 'green';
      if (ratio >= 1) return 'green';
      if (ratio >= 0.8) return 'orange';
      return 'red';
    });
  }, [playerReps, scheduledDate, minTanks, minMelee, minRange, minHealers, minSpecRowsFlat]);

  const liveStats = useMemo(() => {
    const tanks = new Set<string>();
    const melee = new Set<string>();
    const range = new Set<string>();
    const healers = new Set<string>();
    const specCounts: Record<string, number> = {};

    for (const p of playerReps) {
      const col = availabilityColorForRaidWindow(p.member.raidTimeSlots, scheduledDate, rangeSlotStrings);
      if (col === 'gray') continue;
      const r = p.character.role;
      if (!r) continue;
      if (r === 'Tank') tanks.add(p.userId);
      else if (r === 'Melee') melee.add(p.userId);
      else if (r === 'Range') range.add(p.userId);
      else if (r === 'Healer') healers.add(p.userId);
      const ms = p.character.mainSpec;
      specCounts[ms] = (specCounts[ms] ?? 0) + 1;
    }

    const specOk: Record<string, boolean> = {};
    for (const row of minSpecRows) {
      const key = minSpecRowToStorageKey(row);
      if (!key || row.count <= 0) continue;
      specOk[key] = countFromSpecDisplayCounts(key, specCounts) >= row.count;
    }

    const rolesMet =
      tanks.size >= minTanks &&
      melee.size >= minMelee &&
      range.size >= minRange &&
      healers.size >= minHealers;
    const specRatio = specFulfillmentRatio(specCounts, minSpecRowsFlat);
    const minOk = rolesMet && specRatio >= 1;

    return {
      tanks: tanks.size,
      melee: melee.size,
      range: range.size,
      healers: healers.size,
      specOk,
      specCounts,
      minOk,
      availablePlayers: new Set(playerReps.map((p) => p.userId)).size,
      signupCount: 0,
    };
  }, [
    playerReps,
    scheduledDate,
    rangeSlotStrings,
    minTanks,
    minMelee,
    minRange,
    minHealers,
    minSpecRows,
    minSpecRowsFlat,
  ]);

  const groupedList = useMemo(() => {
    const byRole = new Map<TbcRole, typeof filteredPool>();
    for (const r of ROLE_ORDER) byRole.set(r, []);
    for (const row of filteredPool) {
      const role = row.character.role;
      if (!role) continue;
      byRole.get(role)!.push(row);
    }
    for (const r of ROLE_ORDER) {
      byRole.get(r)!.sort((a, b) => {
        const ca = a.character.classId ?? '';
        const cb = b.character.classId ?? '';
        if (ca !== cb) return ca.localeCompare(cb);
        return a.character.name.localeCompare(b.character.name);
      });
    }
    return byRole;
  }, [filteredPool]);

  const toggleRole = (r: TbcRole) => {
    setRoleFilter((prev) => {
      const next = { ...prev, [r]: !prev[r] };
      const any = ROLE_ORDER.some((x) => next[x]);
      return any ? next : prev;
    });
  };

  const toggleClass = (classId: string) => {
    setClassFilter((prev) => {
      const next = { ...prev, [classId]: !prev[classId] };
      const any = TBC_CLASS_IDS.some((id) => next[id]);
      return any ? next : prev;
    });
  };

  const toggleAllowWeekday = () => {
    setAllowWeekday((prev) => {
      const next = !prev;
      return next || allowWeekend ? next : prev;
    });
  };

  const toggleAllowWeekend = () => {
    setAllowWeekend((prev) => {
      const next = !prev;
      return next || allowWeekday ? next : prev;
    });
  };

  const addMinSpecRow = () => {
    setMinSpecRows((rows) => [
      ...rows,
      {
        classId: TBC_CLASS_IDS[0] ?? 'warrior',
        specChoice: MIN_SPEC_CLASS_ONLY,
        count: 1,
      },
    ]);
  };

  const handleTimelineClick = (i: number) => {
    if (!pickingEnd) {
      setRangeStartIdx(i);
      setRangeEndIdx(i);
      setPickingEnd(true);
    } else {
      setRangeEndIdx(i);
      setPickingEnd(false);
    }
  };

  const handleRaidStartDatetimeChange = (s: string) => {
    const d = parseDatetimeLocal(s);
    const { baseYmd, slotIndex } = localDateTimeToNearestRaidBaseAndSlotIndex(d);
    setScheduledDate(baseYmd);
    const N = SLOTS.length;
    const oldIndices = expandSlotIndicesForward(rangeStartIdx, rangeEndIdx);
    const len = Math.max(1, oldIndices.length);
    let endIdx = slotIndex;
    for (let k = 1; k < len; k++) {
      endIdx = (endIdx + 1) % N;
    }
    setRangeStartIdx(slotIndex);
    setRangeEndIdx(endIdx);
    setPickingEnd(false);
    setSignupDatetimeLocal(toDatetimeLocalValue(suggestedSignupBeforeRaid(d)));
  };

  const openAvailabilityPlanner = () => {
    setScheduleSnapshot({
      scheduledDate,
      rangeStartIdx,
      rangeEndIdx,
      pickingEnd,
      signupDatetimeLocal,
    });
    setPickingEnd(false);
    setAvailabilityOpen(true);
  };

  const cancelAvailabilityPlanner = useCallback(() => {
    if (scheduleSnapshot) {
      setScheduledDate(scheduleSnapshot.scheduledDate);
      setRangeStartIdx(scheduleSnapshot.rangeStartIdx);
      setRangeEndIdx(scheduleSnapshot.rangeEndIdx);
      setPickingEnd(scheduleSnapshot.pickingEnd);
      setSignupDatetimeLocal(scheduleSnapshot.signupDatetimeLocal);
    }
    setScheduleSnapshot(null);
    setAvailabilityOpen(false);
  }, [scheduleSnapshot]);

  useEffect(() => {
    if (!availabilityOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelAvailabilityPlanner();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [availabilityOpen, cancelAvailabilityPlanner]);

  const applyAvailabilityPlanner = () => {
    setScheduleSnapshot(null);
    setAvailabilityOpen(false);
    setSignupDatetimeLocal((prev) => {
      const signupD = parseDatetimeLocal(prev);
      if (signupD.getTime() < scheduledAt.getTime()) return prev;
      return toDatetimeLocalValue(suggestedSignupBeforeRaid(scheduledAt));
    });
  };

  const submit = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      if (requiresReset && !resetAck) {
        setSaveError(tEdit('resetSignupsWarning'));
        setSaving(false);
        return;
      }
      if (!name.trim() || dungeonIds.length === 0) {
        setSaveError(t('validationBasics'));
        setSaving(false);
        return;
      }
      if (!signupDatetimeLocal.trim()) {
        setSaveError(t('validationSignupRequired'));
        setSaving(false);
        return;
      }
      const signupD = parseDatetimeLocal(signupDatetimeLocal);
      if (!(signupD.getTime() < scheduledAt.getTime())) {
        setSaveError(t('validationSignupBeforeRaid'));
        setSaving(false);
        return;
      }
      const dungeonId = dungeonIds[0] ?? '';
      const minSpecs: Record<string, number> = {};
      for (const r of minSpecRows) {
        const key = minSpecRowToStorageKey(r);
        if (key && r.count > 0) minSpecs[key] = r.count;
      }

      const body = {
        dungeonId,
        dungeonIds,
        name,
        note: note || null,
        raidLeaderId,
        lootmasterId: lootmasterId || null,
        minTanks,
        minMelee,
        minRange,
        minHealers,
        minSpecs,
        raidGroupRestrictionId: raidGroupRestrictionId || null,
        maxPlayers,
        scheduledAt: scheduledAt.toISOString(),
        scheduledEndAt: scheduledEndAt.toISOString(),
        signupUntil: signupUntil.toISOString(),
        signupVisibility,
        discordChannelId: discordChannelId.trim() || null,
        discordLeaderChannelId: discordLeaderChannelId.trim() || null,
      };

      const res = await fetch(isEdit ? `/api/guilds/${guildId}/raids/${raidId}` : `/api/guilds/${guildId}/raids`, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...body,
          ...(requiresReset ? { confirmResetSignups: true } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((json as { error?: string }).error || res.statusText);
      }
      router.push(
        isEdit ? `/${locale}/guild/${guildId}/raid/${raidId}` : `/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`
      );
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  const doCancelRaid = async () => {
    if (!isEdit || !raidId) return;
    if (!window.confirm(tEdit('cancelConfirm'))) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/guilds/${guildId}/raids/${raidId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (!res.ok) return;
      router.push(`/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const doDeleteRaid = async () => {
    if (!isEdit || !raidId) return;
    if (!window.confirm(tDetail('deleteRaidConfirm'))) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/guilds/${guildId}/raids/${raidId}`, { method: 'DELETE' });
      if (!res.ok) return;
      router.push(`/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const weekAbbr = (m: PoolMember) => {
    if (m.weekFocus === 'weekday') return t('weekAbbrWeekday');
    if (m.weekFocus === 'weekend') return t('weekAbbrWeekend');
    return '–';
  };

  if (loading) {
    return (
      <p className="text-muted-foreground text-sm" role="status">
        {t('loading')}
      </p>
    );
  }

  if (loadError || !data) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {loadError || t('loadError')}
      </p>
    );
  }

  if (data.dungeons.length === 0) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {t('noDungeons')}
      </p>
    );
  }

  const effectiveDungeonId = dungeonIds[0] ?? '';

  const roleMinConfig = [
    { role: 'Tank' as const, val: minTanks, set: setMinTanks, key: 'minTanks' as const },
    { role: 'Healer' as const, val: minHealers, set: setMinHealers, key: 'minHealers' as const },
    { role: 'Melee' as const, val: minMelee, set: setMinMelee, key: 'minMelee' as const },
    { role: 'Range' as const, val: minRange, set: setMinRange, key: 'minRange' as const },
  ];

  const matchingCount = filteredPool.length;

  return (
    <div className="max-w-6xl space-y-8">
      {isEdit ? (
        <section className="rounded-xl border border-border bg-card p-4 md:p-5 flex flex-wrap items-center gap-3 justify-between">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{tEdit('sectionBasics')}</span>
            <span className="mx-2 text-border">·</span>
            <span>{tEdit('terminSection')}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving || !editable}
              className="rounded-md border border-destructive text-destructive px-4 py-2 text-sm font-medium disabled:opacity-50"
              onClick={() => void doCancelRaid()}
            >
              🚫 {tEdit('cancelRaid')}
            </button>
            <button
              type="button"
              disabled={saving}
              className="rounded-md border border-destructive bg-destructive/10 text-destructive px-4 py-2 text-sm font-medium disabled:opacity-50"
              onClick={() => void doDeleteRaid()}
            >
              🗑️ {tDetail('menuDeleteRaid')}
            </button>
          </div>
        </section>
      ) : null}

      <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-4 md:p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
              {t('sectionBasics')}
            </h2>
            <fieldset disabled={!editable} className="grid gap-4 sm:grid-cols-2 disabled:opacity-70">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">
                  {t('dungeon')} <span className="text-destructive">*</span>
                </span>
                <div className="relative">
                  <button
                    type="button"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-left text-sm hover:bg-muted/30"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDungeonMenuOpen((v) => !v);
                    }}
                    aria-haspopup="menu"
                    aria-expanded={dungeonMenuOpen}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {dungeonIds.length === 0
                          ? '—'
                          : data.dungeons
                              .filter((d) => dungeonIds.includes(d.id))
                              .map((d) => d.name)
                              .join(', ')}
                      </span>
                      <span className="text-muted-foreground">▾</span>
                    </span>
                  </button>
                  {dungeonMenuOpen ? (
                    <div
                      className="absolute z-20 mt-2 w-full rounded-md border border-border bg-background shadow-lg overflow-hidden"
                      role="menu"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div className="max-h-64 overflow-auto p-2 space-y-1">
                        {data.dungeons.map((d) => {
                          const checked = dungeonIds.includes(d.id);
                          return (
                            <button
                              key={d.id}
                              type="button"
                              className="w-full text-left px-2 py-2 rounded hover:bg-muted flex items-center gap-2"
                              onClick={() => {
                                setDungeonIds((prev) => {
                                  let next: string[];
                                  if (prev.includes(d.id)) {
                                    next = prev.filter((x) => x !== d.id);
                                    if (next.length === 0) return prev;
                                  } else {
                                    next = [...prev, d.id];
                                  }
                                  const selected = data.dungeons.filter((x) => next.includes(x.id));
                                  const mx = selected.reduce((m, x) => Math.max(m, x.maxPlayers), 0);
                                  if (mx > 0) setMaxPlayers(mx);
                                  return next;
                                });
                              }}
                            >
                              <span className="shrink-0">{checked ? '✅' : '⬜'}</span>
                              <span className="min-w-0 truncate flex-1">{d.name}</span>
                              <span className="tabular-nums text-xs text-muted-foreground shrink-0">{d.maxPlayers}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">
                  {t('raidName')} <span className="text-destructive">*</span>
                </span>
                <input
                  className="rounded-md border border-input bg-background px-3 py-2 text-foreground"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                <span className="text-muted-foreground">{t('note')}</span>
                <textarea
                  className="min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-foreground"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">{t('raidLeader')}</span>
                <select
                  className="rounded-md border border-input bg-background px-3 py-2 text-foreground"
                  value={raidLeaderId}
                  onChange={(e) => setRaidLeaderId(e.target.value)}
                >
                  {data.leaders.map((l) => (
                    <option key={l.userId} value={l.userId}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">{t('lootmaster')}</span>
                <select
                  className="rounded-md border border-input bg-background px-3 py-2 text-foreground"
                  value={lootmasterId}
                  onChange={(e) => setLootmasterId(e.target.value)}
                >
                  <option value="">{t('lootmasterNone')}</option>
                  {data.leaders.map((l) => (
                    <option key={l.userId} value={l.userId}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">{t('maxPlayers')}</span>
                <input
                  type="number"
                  min={1}
                  max={40}
                  className="rounded-md border border-input bg-background px-3 py-2 text-foreground"
                  value={maxPlayers}
                  readOnly
                  aria-readonly="true"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">{t('raidGroupRestriction')}</span>
                <select
                  className="rounded-md border border-input bg-background px-3 py-2 text-foreground"
                  value={raidGroupRestrictionId}
                  onChange={(e) => setRaidGroupRestrictionId(e.target.value)}
                >
                  <option value="">{t('noRestriction')}</option>
                  {data.raidGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
                <span className="text-muted-foreground">{t('signupVisibility')}</span>
                <select
                  className="rounded-md border border-input bg-background px-3 py-2 text-foreground"
                  value={signupVisibility}
                  onChange={(e) =>
                    setSignupVisibility(
                      e.target.value === 'raid_leader_only' ? 'raid_leader_only' : 'public'
                    )
                  }
                >
                  <option value="public">{t('visibilityPublic')}</option>
                  <option value="raid_leader_only">{t('visibilityLeaders')}</option>
                </select>
              </label>
            </fieldset>
          </section>

          <section className="rounded-xl border border-border bg-card p-4 md:p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
              {t('sectionTermin')}
            </h2>
            <fieldset disabled={!editable} className="space-y-4 disabled:opacity-70">
              <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
                <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm lg:max-w-md">
                  <span className="text-muted-foreground">
                    {t('scheduledDate')} <span className="text-destructive">*</span>
                  </span>
                  <input
                    type="datetime-local"
                    className="rounded-md border border-input bg-background px-3 py-2 text-foreground"
                    value={toDatetimeLocalValue(scheduledAt)}
                    onChange={(e) => handleRaidStartDatetimeChange(e.target.value)}
                  />
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm lg:max-w-md">
                  <span className="text-muted-foreground">
                    {t('signupUntilCombined')} <span className="text-destructive">*</span>
                  </span>
                  <input
                    type="datetime-local"
                    className="rounded-md border border-input bg-background px-3 py-2 text-foreground"
                    value={signupDatetimeLocal}
                    onChange={(e) => setSignupDatetimeLocal(e.target.value)}
                  />
                </label>
                <div className="flex shrink-0 pb-0.5">
                  <button
                    type="button"
                    className="rounded-md border border-border bg-muted/30 px-4 py-2 text-sm font-medium hover:bg-muted/50"
                    onClick={openAvailabilityPlanner}
                  >
                    {t('openAvailabilityPlanner')}
                  </button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t('raidDateHint')}</p>
            </fieldset>
          </section>

          <section className="rounded-xl border border-border bg-card p-4 md:p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
              {t('sectionMinimum')}
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {roleMinConfig.map(({ role, val, set, key }) => (
                <div
                  key={key}
                  className="rounded-lg border border-border bg-muted/20 p-2.5 flex flex-col gap-1.5"
                >
                  <div className="text-sm font-medium text-foreground">{t(key)}</div>
                  <div className="flex items-center justify-center gap-2 min-h-[2.25rem]">
                    <RoleIcon role={role} size={22} />
                    <span className="text-muted-foreground select-none" aria-hidden>
                      |
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={25}
                      className="w-12 shrink-0 rounded-md border border-input bg-background px-1.5 py-1 text-center text-sm tabular-nums"
                      value={val}
                      onChange={(e) => set(Number(e.target.value))}
                      aria-label={t(key)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{t('minSpecs')}</span>
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={addMinSpecRow}
                >
                  {t('addMinSpec')}
                </button>
              </div>
              {minSpecRows.map((row, idx) => (
                <MinSpecRequirementRow
                  key={idx}
                  row={row}
                  onChange={(next) =>
                    setMinSpecRows((rows) => rows.map((r, i) => (i === idx ? next : r)))
                  }
                  onRemove={() => setMinSpecRows((rows) => rows.filter((_, i) => i !== idx))}
                  removeLabel={t('remove')}
                  t={t}
                  tProfile={tProfile}
                />
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4 md:p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
              {t('sectionDiscord')}
            </h2>
            <label className="flex flex-col gap-1.5 text-sm max-w-md">
              <span className="text-muted-foreground">{t('threadChannel')}</span>
              <select
                className="rounded-md border border-input bg-background px-3 py-2"
                value={discordChannelId}
                onChange={(e) => setDiscordChannelId(e.target.value)}
              >
                <option value="">{t('channelNoPost')}</option>
                {data.allowedChannels.map((ch) => (
                  <option key={ch.id} value={ch.discordChannelId}>
                    {ch.name || ch.discordChannelId}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm max-w-md">
              <span className="text-muted-foreground">{t('leaderChannelLabel')}</span>
              <select
                className="rounded-md border border-input bg-background px-3 py-2"
                value={discordLeaderChannelId}
                onChange={(e) => setDiscordLeaderChannelId(e.target.value)}
              >
                <option value="">{t('lootmasterNone')}</option>
                {data.allowedChannels.map((ch) => (
                  <option key={ch.id} value={ch.discordChannelId}>
                    {ch.name || ch.discordChannelId}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {isEdit ? (
            <div className="rounded-xl border border-border bg-muted/15 p-4 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">ℹ️</span>{' '}
              {tEdit('resetSignupsWarning')}
            </div>
          ) : null}

          {isEdit && requiresReset ? (
            <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 space-y-2">
              <p className="text-sm">⚠️ {tEdit('resetSignupsWarning')}</p>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={resetAck}
                  onChange={(e) => setResetAck(e.target.checked)}
                />
                <span>{tEdit('confirmReset')}</span>
              </label>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            {isEdit ? (
              <Link
                href={`/${locale}/guild/${guildId}/raid/${raidId}`}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                {t('cancel')}
              </Link>
            ) : (
              <Link
                href={`/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                {t('cancel')}
              </Link>
            )}
            <button
              type="button"
              disabled={saving || (requiresReset && !resetAck) || !editable}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              onClick={() => void submit()}
            >
              {saving ? t('saving') : t('saveRaid')}
            </button>
            {isEdit ? (
              <>
                <button
                  type="button"
                  disabled={saving || !editable}
                  className="rounded-md border border-destructive text-destructive px-4 py-2 text-sm font-medium disabled:opacity-50"
                  onClick={() => void doCancelRaid()}
                >
                  🚫 {tEdit('cancelRaid')}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  className="rounded-md border border-destructive bg-destructive/10 text-destructive px-4 py-2 text-sm font-medium disabled:opacity-50"
                  onClick={() => void doDeleteRaid()}
                >
                  🗑️ {tDetail('menuDeleteRaid')}
                </button>
              </>
            ) : null}
          </div>
          {saveError ? (
            <p className="text-destructive text-sm" role="alert">
              {saveError}
            </p>
          ) : null}
        </div>

      {portalMounted && availabilityOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/50 p-4 md:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="availability-dialog-title"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) cancelAvailabilityPlanner();
              }}
            >
              <div
                className="my-4 w-full max-w-6xl space-y-4 rounded-xl border border-border bg-background shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="border-b border-border px-4 py-3 md:px-5">
                  <h2 id="availability-dialog-title" className="text-base font-semibold text-foreground">
                    {t('openAvailabilityPlanner')}
                  </h2>
                  <p className="text-sm text-muted-foreground max-w-2xl mt-1">{t('step2FromTerminHint')}</p>
                </div>
                <div className="space-y-4 px-4 pb-5 md:px-5">

          <div
            className={cn(
              'flex flex-wrap items-center justify-center gap-5 md:gap-8 rounded-xl border border-border bg-muted/25 px-4 py-3',
              liveStats.minOk ? 'ring-1 ring-emerald-600/40' : 'ring-1 ring-amber-600/35'
            )}
            title={t('liveTitle')}
            aria-label={t('liveTitle')}
          >
            <span className="sr-only">{t('liveTitle')}</span>
            <span className="flex items-center gap-1.5" title={t('minTanks')}>
              <RoleIcon role="Tank" size={24} />
              <span className="tabular-nums text-lg font-semibold">{liveStats.tanks}</span>
              <span className="text-muted-foreground tabular-nums">/</span>
              <span className="tabular-nums text-muted-foreground">{minTanks}</span>
            </span>
            <span className="flex items-center gap-1.5" title={t('minHealers')}>
              <RoleIcon role="Healer" size={24} />
              <span className="tabular-nums text-lg font-semibold">{liveStats.healers}</span>
              <span className="text-muted-foreground tabular-nums">/</span>
              <span className="tabular-nums text-muted-foreground">{minHealers}</span>
            </span>
            <span className="flex items-center gap-1.5" title={t('minMelee')}>
              <RoleIcon role="Melee" size={24} />
              <span className="tabular-nums text-lg font-semibold">{liveStats.melee}</span>
              <span className="text-muted-foreground tabular-nums">/</span>
              <span className="tabular-nums text-muted-foreground">{minMelee}</span>
            </span>
            <span className="flex items-center gap-1.5" title={t('minRange')}>
              <RoleIcon role="Range" size={24} />
              <span className="tabular-nums text-lg font-semibold">{liveStats.range}</span>
              <span className="text-muted-foreground tabular-nums">/</span>
              <span className="tabular-nums text-muted-foreground">{minRange}</span>
            </span>
            {minSpecRows.map((row, idx) => {
              const key = minSpecRowToStorageKey(row);
              if (!key || row.count <= 0) return null;
              const cur = countFromSpecDisplayCounts(key, liveStats.specCounts);
              const rowN = normalizeMinSpecRow(row);
              const specLabel = minSpecRowSpecDisplayName(rowN);
              const title =
                rowN.legacyDisplayKey ??
                (minSpecRowUsesClassIconOnly(rowN)
                  ? tProfile(RAID_PLANNER_CLASS_I18N[rowN.classId as keyof typeof RAID_PLANNER_CLASS_I18N])
                  : specLabel ?? key);
              return (
                <span key={`${key}-${idx}`} className="flex items-center gap-1.5" title={title}>
                  {rowN.legacyDisplayKey ? (
                    <ClassIcon classId={rowN.classId} size={24} title={rowN.legacyDisplayKey} />
                  ) : minSpecRowUsesClassIconOnly(rowN) ? (
                    <ClassIcon classId={rowN.classId} size={24} />
                  ) : (
                    <SpecIcon spec={specLabel!} size={24} />
                  )}
                  <span className="tabular-nums text-lg font-semibold">{cur}</span>
                  <span className="text-muted-foreground tabular-nums">/</span>
                  <span className="tabular-nums text-muted-foreground">{row.count}</span>
                </span>
              );
            })}
            <span className="flex items-center gap-1.5" title={t('maxPlayers')}>
              <span className="text-xl leading-none" aria-hidden>
                👥
              </span>
              <span className="tabular-nums text-lg font-semibold">{matchingCount}</span>
              <span className="text-muted-foreground tabular-nums">/</span>
              <span className="tabular-nums text-muted-foreground">{maxPlayers}</span>
            </span>
          </div>

          <p className="text-xs text-muted-foreground">{t('timelineClickHint')}</p>

          <div className="grid grid-cols-1 lg:grid-cols-[4.75rem_minmax(0,1fr)_minmax(210px,300px)] gap-4 items-start">
            <div className="flex flex-col gap-0.5 lg:sticky lg:top-4">
              {SLOTS.map((slot, i) => {
                const inRange = rangeIndices.includes(i);
                const heat = slotHeat[i] ?? 'red';
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => handleTimelineClick(i)}
                    className={cn(
                      'h-8 w-full rounded border text-[11px] font-medium transition-colors bg-background hover:bg-muted/40',
                      'border-border',
                      inRange && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                      pickingEnd && rangeStartIdx === i && 'ring-2 ring-amber-500'
                    )}
                  >
                    <span className="flex items-center justify-between gap-2 px-2">
                      <span className="tabular-nums">{slot}</span>
                      <span
                        aria-hidden
                        className={cn(
                          'inline-block h-2.5 w-2.5 rounded-full border',
                          heat === 'green' && 'bg-emerald-500 border-emerald-600',
                          heat === 'yellow' && 'bg-yellow-400 border-yellow-600',
                          heat === 'orange' && 'bg-orange-500 border-orange-600',
                          heat === 'red' && 'bg-red-500 border-red-600'
                        )}
                      />
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="min-w-0 space-y-6 rounded-xl border border-border bg-card p-4">
              <h2 className="text-base font-semibold text-foreground">{t('membersHeading')}</h2>
              {ROLE_ORDER.map((role) => {
                const list = groupedList.get(role) ?? [];
                if (list.length === 0) return null;
                return (
                  <div key={role}>
                    <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                      <RoleIcon role={role} size={20} />
                      {role}
                    </h3>
                    <ul className="space-y-1.5">
                      {list.map(({ character, color, member }) => (
                        <li
                          key={character.id}
                          className={cn(
                            'flex flex-wrap items-center gap-2 rounded-lg border px-2 py-1.5 text-sm',
                            color === 'green' && 'border-green-600/40 bg-green-500/10',
                            color === 'orange' && 'border-amber-600/40 bg-amber-500/10',
                            color === 'gray' && 'opacity-55 border-border bg-muted/30'
                          )}
                        >
                          <CharacterMainStar
                            isMain={!!character.isMain}
                            titleMain={tProfile('mainLabel')}
                            titleAlt={tProfile('altLabel')}
                            sizePx={16}
                          />

                          {character.classId ? <ClassIcon classId={character.classId} size={22} /> : null}

                          <span className="flex items-center gap-1.5">
                            <CharacterSpecIconsInline
                              mainSpec={character.mainSpec}
                              offSpec={character.offSpec}
                              size={22}
                              slashClassName="hidden"
                              offSpecWrapperBaseClassName=""
                              offSpecIconClassName="grayscale contrast-200 brightness-75"
                            />
                          </span>

                          <span className="font-medium min-w-0 truncate">{character.name}</span>

                          <span className="ml-auto flex items-center gap-2">
                            {character.guildDiscordDisplayName ? (
                              <span
                                className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground max-w-[9rem] truncate"
                                title={character.guildDiscordDisplayName}
                              >
                                {character.guildDiscordDisplayName}
                              </span>
                            ) : null}
                            <span
                              className="rounded border border-border bg-muted/50 px-1 py-0.5 text-[10px] font-bold text-muted-foreground"
                              title={t('weekFocusShortTitle')}
                            >
                              {weekAbbr(member)}
                            </span>
                            {character.hasBattlenet ? (
                              <BattlenetLogo size={18} title={tProfile('bnetLinkedBadgeTitle')} />
                            ) : null}
                            <CharacterGearscoreBadge
                              characterId={character.id}
                              hasBattlenet={character.hasBattlenet}
                              gearScore={character.gearScore}
                            />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl border border-border bg-muted/15 p-4 space-y-3 lg:sticky lg:top-4">
              <p className="text-sm font-medium border-b border-border pb-2">{t('filters')}</p>
              <div className="space-y-1.5">
                <span className="text-muted-foreground text-xs">{t('filterChars')}</span>
                <div className="flex rounded-lg border border-border p-0.5 bg-muted/30">
                  {(
                    [
                      ['mains', t('filterCharsMains')],
                      ['both', t('filterCharsBoth')],
                      ['twinks', t('filterCharsTwinks')],
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
                <span className="text-muted-foreground text-xs">{t('filterDays')}</span>
                <div className="flex rounded-lg border border-border p-0.5 bg-muted/30">
                  <button
                    type="button"
                    onClick={toggleAllowWeekday}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm flex-1',
                      allowWeekday
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    )}
                    aria-pressed={allowWeekday}
                  >
                    {t('focusWeekday')}
                  </button>
                  <button
                    type="button"
                    onClick={toggleAllowWeekend}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-sm flex-1',
                      allowWeekend
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted'
                    )}
                    aria-pressed={allowWeekend}
                  >
                    {t('focusWeekend')}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-muted-foreground text-xs">{t('filterRoles')}</span>
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
                      title={r}
                    >
                      <RoleIcon role={r} size={18} />
                      <span>{r}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="text-muted-foreground text-xs">{t('filterClasses')}</span>
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
                      title={t(RAID_PLANNER_CLASS_I18N[classId as keyof typeof RAID_PLANNER_CLASS_I18N])}
                    >
                      <ClassIcon classId={classId} size={18} />
                      <span className="truncate">
                        {t(RAID_PLANNER_CLASS_I18N[classId as keyof typeof RAID_PLANNER_CLASS_I18N])}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <span className="text-muted-foreground text-xs">{t('filterAvailability')}</span>
                <div className="flex flex-col gap-2">
                  {(
                    [
                      ['all', t('filterAvailabilityAll')],
                      ['available', t('filterAvailabilityAvailable')],
                      ['limited', t('filterAvailabilityLimited')],
                      ['unavailable', t('filterAvailabilityUnavailable')],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAvailabilityFilter(v)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-sm text-left',
                        availabilityFilter === v
                          ? 'border-primary/50 bg-primary/10 text-foreground'
                          : 'border-border bg-background text-muted-foreground hover:bg-muted/40'
                      )}
                      aria-pressed={availabilityFilter === v}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>{t('heatmapLegendGreen')}</p>
            <p>{t('heatmapLegendYellow')}</p>
            <p>{t('heatmapLegendOrange')}</p>
            <p>{t('heatmapLegendRed')}</p>
          </div>

                  <div className="flex flex-wrap gap-3 border-t border-border pt-4">
                    <button
                      type="button"
                      className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
                      onClick={cancelAvailabilityPlanner}
                    >
                      {t('cancelFromAvailability')}
                    </button>
                    <button
                      type="button"
                      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                      onClick={applyAvailabilityPlanner}
                    >
                      {t('applyFromAvailability')}
                    </button>
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
