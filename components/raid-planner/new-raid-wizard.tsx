'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { getAllSpecDisplayNames, type TbcRole } from '@/lib/wow-tbc-classes';
import {
  addMinutes,
  expandSlotIndicesForward,
  raidSlotToLocalDate,
  slotStringsForIndices,
} from '@/lib/raid-planner-time';
import { ClassIcon } from '@/components/class-icon';
import { SpecIcon } from '@/components/spec-icon';
import { RoleIcon } from '@/components/role-icon';
import { CharacterMainStar } from '@/components/character-main-star';
import { CharacterGearscoreBadge } from '@/components/character-gearscore-badge';
import { BattlenetLogo } from '@/components/battlenet-logo';

const ALL_SPECS = getAllSpecDisplayNames();
const ROLE_ORDER: TbcRole[] = ['Tank', 'Healer', 'Melee', 'Range'];
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
}: {
  guildId: string;
  currentUserId: string;
}) {
  const t = useTranslations('raidPlanner');
  const tProfile = useTranslations('profile');
  const locale = useLocale();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [data, setData] = useState<Bootstrap | null>(null);

  const [dungeonIds, setDungeonIds] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [raidLeaderId, setRaidLeaderId] = useState(currentUserId);
  const [lootmasterId, setLootmasterId] = useState<string>('');
  const [minTanks, setMinTanks] = useState(1);
  const [minMelee, setMinMelee] = useState(0);
  const [minRange, setMinRange] = useState(0);
  const [minHealers, setMinHealers] = useState(0);
  const [minSpecRows, setMinSpecRows] = useState<{ spec: string; count: number }[]>([]);
  const [raidGroupRestrictionId, setRaidGroupRestrictionId] = useState('');
  const [maxPlayers, setMaxPlayers] = useState(25);
  const [scheduledDate, setScheduledDate] = useState(() => {
    const t0 = new Date();
    const y = t0.getFullYear();
    const m = String(t0.getMonth() + 1).padStart(2, '0');
    const d = String(t0.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [signupDatetimeLocal, setSignupDatetimeLocal] = useState(() => {
    const t0 = new Date();
    t0.setHours(12, 0, 0, 0);
    return toDatetimeLocalValue(t0);
  });
  const [signupVisibility, setSignupVisibility] = useState<'public' | 'raid_leader_only'>(
    'public'
  );
  const [discordChannelId, setDiscordChannelId] = useState('');
  const [createDiscordThread, setCreateDiscordThread] = useState(false);

  const [rangeStartIdx, setRangeStartIdx] = useState(DEFAULT_SLOT_IDX);
  const [rangeEndIdx, setRangeEndIdx] = useState(DEFAULT_SLOT_IDX);
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
  const [availabilityFilter, setAvailabilityFilter] = useState<AvailabilityFilter>('all');

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
      if (json.dungeons.length > 0) {
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
  }, [guildId, locale, currentUserId]);

  useEffect(() => {
    loadBootstrap();
  }, [loadBootstrap]);

  const restriction = raidGroupRestrictionId.trim();
  const anyRoleSelected = ROLE_ORDER.some((r) => roleFilter[r]);

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
    scheduledDate,
    rangeSlotStrings,
    raidGroupRestrictionId,
    availabilityFilter,
  ]);

  const slotHeat = useMemo((): SlotHeat[] => {
    const activeSpecs = minSpecRows.filter((r) => r.spec && r.count > 0);
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

      const ratio = specFulfillmentRatio(specCounts, minSpecRows);

      if (!rolesMet) return 'yellow';
      if (activeSpecs.length === 0) return 'green';
      if (ratio >= 1) return 'green';
      if (ratio >= 0.8) return 'orange';
      return 'red';
    });
  }, [playerReps, scheduledDate, minTanks, minMelee, minRange, minHealers, minSpecRows]);

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
      if (row.count <= 0 || !row.spec) continue;
      specOk[row.spec] = (specCounts[row.spec] ?? 0) >= row.count;
    }

    const rolesMet =
      tanks.size >= minTanks &&
      melee.size >= minMelee &&
      range.size >= minRange &&
      healers.size >= minHealers;
    const specRatio = specFulfillmentRatio(specCounts, minSpecRows);
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
  }, [playerReps, scheduledDate, rangeSlotStrings, minTanks, minMelee, minRange, minHealers, minSpecRows]);

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
    setMinSpecRows((rows) => [...rows, { spec: ALL_SPECS[0]?.displayName ?? '', count: 1 }]);
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

  const submit = async () => {
    setSaveError(null);
    setSaving(true);
    try {
      const dungeonId = dungeonIds[0] ?? '';
      const minSpecs: Record<string, number> = {};
      for (const r of minSpecRows) {
        if (r.spec && r.count > 0) minSpecs[r.spec] = r.count;
      }

      const body = {
        dungeonId,
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
        discordChannelId: createDiscordThread ? discordChannelId || null : null,
        createDiscordThread,
      };

      const res = await fetch(`/api/guilds/${guildId}/raids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((json as { error?: string }).error || res.statusText);
      }
      router.push(`/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`);
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Error');
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
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className={cn(step === 1 && 'text-foreground font-medium')}>{t('step1')}</span>
        <span aria-hidden>→</span>
        <span className={cn(step === 2 && 'text-foreground font-medium')}>{t('step2')}</span>
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <section className="rounded-xl border border-border bg-card p-4 md:p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
              {t('sectionBasics')}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">{t('dungeon')}</span>
                <div className="space-y-2 rounded-md border border-input bg-background px-3 py-2">
                  {data.dungeons.map((d) => {
                    const checked = dungeonIds.includes(d.id);
                    return (
                      <label key={d.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const nextChecked = e.target.checked;
                            setDungeonIds((prev) => {
                              let next: string[];
                              if (nextChecked) {
                                next = prev.includes(d.id) ? prev : [...prev, d.id];
                              } else {
                                next = prev.filter((x) => x !== d.id);
                                if (next.length === 0) return prev;
                              }
                              const selected = data.dungeons.filter((x) => next.includes(x.id));
                              const mx = selected.reduce((m, x) => Math.max(m, x.maxPlayers), 0);
                              if (mx > 0) setMaxPlayers(mx);
                              return next;
                            });
                          }}
                        />
                        <span className="min-w-0 truncate">{d.name}</span>
                        <span className="ml-auto tabular-nums text-xs text-muted-foreground">
                          {d.maxPlayers}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">{t('raidName')}</span>
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
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4 md:p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
              {t('sectionMinimum')}
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {roleMinConfig.map(({ role, val, set, key }) => (
                <div
                  key={key}
                  className="flex flex-col items-center gap-2 rounded-lg border border-border bg-muted/20 p-3"
                >
                  <RoleIcon role={role} size={28} />
                  <span className="text-xs text-muted-foreground text-center">{t(key)}</span>
                  <input
                    type="number"
                    min={0}
                    max={25}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-center text-sm"
                    value={val}
                    onChange={(e) => set(Number(e.target.value))}
                    aria-label={t(key)}
                  />
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
                <div
                  key={idx}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/15 px-3 py-2"
                >
                  <SpecIcon spec={row.spec} size={28} />
                  <select
                    className="flex-1 min-w-[180px] rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                    value={row.spec}
                    onChange={(e) => {
                      const v = e.target.value;
                      setMinSpecRows((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, spec: v } : r))
                      );
                    }}
                    aria-label={t('minSpecs')}
                  >
                    {ALL_SPECS.map((s) => (
                      <option key={s.displayName} value={s.displayName}>
                        {s.displayName}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className="w-16 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-center"
                    value={row.count}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setMinSpecRows((rows) =>
                        rows.map((r, i) => (i === idx ? { ...r, count: n } : r))
                      );
                    }}
                  />
                  <button
                    type="button"
                    className="text-sm text-destructive hover:underline shrink-0"
                    onClick={() => setMinSpecRows((rows) => rows.filter((_, i) => i !== idx))}
                  >
                    {t('remove')}
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4 md:p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">
              {t('sectionSignup')}
            </h2>
            <label className="flex flex-col gap-1.5 text-sm max-w-md">
              <span className="text-muted-foreground">{t('signupUntilCombined')}</span>
              <input
                type="datetime-local"
                className="rounded-md border border-input bg-background px-3 py-2"
                value={signupDatetimeLocal}
                onChange={(e) => setSignupDatetimeLocal(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm max-w-md">
              <span className="text-muted-foreground">{t('signupVisibility')}</span>
              <select
                className="rounded-md border border-input bg-background px-3 py-2"
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
                <option value="">{t('channelPlaceholder')}</option>
                {data.allowedChannels.map((ch) => (
                  <option key={ch.id} value={ch.discordChannelId}>
                    {ch.name || ch.discordChannelId}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={createDiscordThread}
                onChange={(e) => setCreateDiscordThread(e.target.checked)}
              />
              {t('createThread')}
            </label>
          </section>

          <p className="text-sm text-muted-foreground">{t('raidDateHint')}</p>

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`}
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              {t('cancel')}
            </Link>
            <button
              type="button"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              onClick={() => {
                if (!name.trim() || !effectiveDungeonId) {
                  setSaveError(t('validationBasics'));
                  return;
                }
                setSaveError(null);
                setPickingEnd(false);
                setStep(2);
              }}
            >
              {t('next')}
            </button>
          </div>
          {saveError && step === 1 && (
            <p className="text-destructive text-sm" role="alert">
              {saveError}
            </p>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <label className="flex flex-col gap-1 text-sm max-w-xs">
            <span className="text-muted-foreground">{t('scheduledDate')}</span>
            <input
              type="date"
              className="rounded-md border border-input bg-background px-3 py-2"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </label>

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
            {minSpecRows.map(
              (row) =>
                row.spec &&
                row.count > 0 && (
                  <span key={row.spec} className="flex items-center gap-1.5" title={row.spec}>
                    <SpecIcon spec={row.spec} size={24} />
                    <span className="tabular-nums text-lg font-semibold">
                      {liveStats.specCounts[row.spec] ?? 0}
                    </span>
                    <span className="text-muted-foreground tabular-nums">/</span>
                    <span className="tabular-nums text-muted-foreground">{row.count}</span>
                  </span>
                )
            )}
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

                          <span className="flex items-center gap-2 min-w-0">
                            <SpecIcon spec={character.mainSpec} size={22} />
                            <span className="min-w-0 truncate">
                              <span className="font-medium">{character.mainSpec}</span>
                              {character.offSpec ? (
                                <span className="text-muted-foreground">{` (${character.offSpec})`}</span>
                              ) : null}
                            </span>
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

          {saveError && (
            <p className="text-destructive text-sm" role="alert">
              {saveError}
            </p>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
              onClick={() => setStep(1)}
            >
              {t('back')}
            </button>
            <button
              type="button"
              disabled={saving}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              onClick={submit}
            >
              {saving ? t('saving') : t('saveRaid')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
