'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { TIME_SLOTS_30MIN } from '@/lib/profile-constants';
import { availabilityColorForRaidStart, isRaidPlannerTimeSlot } from '@/lib/raid-availability';
import { getAllSpecDisplayNames, type TbcRole } from '@/lib/wow-tbc-classes';
import { ClassIcon } from '@/components/class-icon';
import { SpecIcon } from '@/components/spec-icon';
import { RoleIcon } from '@/components/role-icon';

const ALL_SPECS = getAllSpecDisplayNames();
const ROLE_ORDER: TbcRole[] = ['Tank', 'Healer', 'Melee', 'Range'];

type GroupCharRule = { raidGroupId: string; characterId: string; allowed: boolean };

type PoolCharacter = {
  id: string;
  name: string;
  mainSpec: string;
  offSpec: string | null;
  isMain: boolean;
  classId: string | null;
  specId: string | null;
  role: TbcRole | null;
};

type PoolMember = {
  userId: string;
  roleInGuild: string;
  weekFocus: string | null;
  raidTimeSlots: { weekday: string; timeSlot: string; preference: string }[];
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

type WeekFocusFilter = 'both' | 'weekday' | 'weekend';

function buildLocalDateTime(dateStr: string, slot: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = slot.split(':').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
}

function defaultDateStr(): string {
  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, '0');
  const d = String(t.getDate()).padStart(2, '0');
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

function memberPassesWeekFocus(m: PoolMember, f: WeekFocusFilter): boolean {
  if (f === 'both') return true;
  if (m.weekFocus == null) return true;
  if (f === 'weekday') return m.weekFocus === 'weekday';
  return m.weekFocus === 'weekend';
}

export function NewRaidWizard({
  guildId,
  currentUserId,
}: {
  guildId: string;
  currentUserId: string;
}) {
  const t = useTranslations('raidPlanner');
  const locale = useLocale();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [data, setData] = useState<Bootstrap | null>(null);

  const [dungeonId, setDungeonId] = useState('');
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
  const [scheduledDate, setScheduledDate] = useState(defaultDateStr);
  const [scheduledSlot, setScheduledSlot] = useState('19:00');
  const [signupDate, setSignupDate] = useState(defaultDateStr);
  const [signupSlot, setSignupSlot] = useState('12:00');
  const [signupVisibility, setSignupVisibility] = useState<'public' | 'raid_leader_only'>(
    'public'
  );
  const [discordChannelId, setDiscordChannelId] = useState('');
  const [createDiscordThread, setCreateDiscordThread] = useState(false);

  const [showTwinks, setShowTwinks] = useState(true);
  const [onlyMains, setOnlyMains] = useState(false);
  const [weekFocusFilter, setWeekFocusFilter] = useState<WeekFocusFilter>('both');
  const [roleFilter, setRoleFilter] = useState<Record<TbcRole, boolean>>({
    Tank: true,
    Healer: true,
    Melee: true,
    Range: true,
  });

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
        setDungeonId(first.id);
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

  const scheduledAt = useMemo(
    () => buildLocalDateTime(scheduledDate, scheduledSlot),
    [scheduledDate, scheduledSlot]
  );
  const signupUntil = useMemo(
    () => buildLocalDateTime(signupDate, signupSlot),
    [signupDate, signupSlot]
  );

  useEffect(() => {
    if (!isRaidPlannerTimeSlot(scheduledSlot)) {
      setScheduledSlot('19:00');
    }
  }, [scheduledSlot]);

  const filteredPool = useMemo(() => {
    if (!data) return [];
    const restriction = raidGroupRestrictionId.trim();
    const anyRoleSelected = ROLE_ORDER.some((r) => roleFilter[r]);

    const rows: { member: PoolMember; character: PoolCharacter; color: ReturnType<typeof availabilityColorForRaidStart> }[] = [];

    for (const m of data.members) {
      if (m.roleInGuild === 'member') continue;
      if (!memberPassesWeekFocus(m, weekFocusFilter)) continue;

      for (const c of m.characters) {
        if (!showTwinks && !c.isMain) continue;
        if (onlyMains && !c.isMain) continue;
        if (restriction && !charAllowedInRestrictedGroup(c.id, m, restriction, data.groupCharAllowed)) {
          continue;
        }
        if (c.role && anyRoleSelected && !roleFilter[c.role]) continue;
        if (!c.role) continue;

        const color = availabilityColorForRaidStart(m.raidTimeSlots, scheduledAt);
        rows.push({ member: m, character: c, color });
      }
    }

    return rows;
  }, [
    data,
    raidGroupRestrictionId,
    weekFocusFilter,
    roleFilter,
    showTwinks,
    onlyMains,
    scheduledAt,
  ]);

  const liveStats = useMemo(() => {
    const countRole = (r: TbcRole) =>
      filteredPool.filter(
        (x) => x.character.role === r && (x.color === 'green' || x.color === 'orange')
      ).length;

    const tanks = countRole('Tank');
    const melee = countRole('Melee');
    const range = countRole('Range');
    const healers = countRole('Healer');

    const specOk: Record<string, boolean> = {};
    for (const row of minSpecRows) {
      if (row.count <= 0 || !row.spec) continue;
      const n = filteredPool.filter(
        (x) =>
          x.character.mainSpec === row.spec && (x.color === 'green' || x.color === 'orange')
      ).length;
      specOk[row.spec] = n >= row.count;
    }

    const minOk =
      tanks >= minTanks &&
      melee >= minMelee &&
      range >= minRange &&
      healers >= minHealers &&
      Object.values(specOk).every(Boolean);

    const availablePlayers = new Set(filteredPool.map((x) => x.member.userId)).size;

    return {
      tanks,
      melee,
      range,
      healers,
      specOk,
      minOk,
      availablePlayers,
      signupCount: 0,
    };
  }, [filteredPool, minTanks, minMelee, minRange, minHealers, minSpecRows]);

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
    setRoleFilter((prev) => ({ ...prev, [r]: !prev[r] }));
  };

  const addMinSpecRow = () => {
    setMinSpecRows((rows) => [...rows, { spec: ALL_SPECS[0]?.displayName ?? '', count: 1 }]);
  };

  const submit = async () => {
    setSaveError(null);
    setSaving(true);
    try {
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

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className={cn(step === 1 && 'text-foreground font-medium')}>{t('step1')}</span>
        <span aria-hidden>→</span>
        <span className={cn(step === 2 && 'text-foreground font-medium')}>{t('step2')}</span>
      </div>

      {step === 1 && (
        <section className="space-y-4 rounded-lg border border-border bg-card p-4 md:p-6">
          <h2 className="text-lg font-semibold text-foreground">{t('sectionBasics')}</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span>{t('dungeon')}</span>
              <select
                className="rounded-md border border-input bg-background px-3 py-2 text-foreground"
                value={dungeonId}
                onChange={(e) => {
                  const id = e.target.value;
                  setDungeonId(id);
                  const d = data.dungeons.find((x) => x.id === id);
                  if (d) setMaxPlayers(d.maxPlayers);
                }}
              >
                {data.dungeons.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span>{t('raidName')}</span>
              <input
                className="rounded-md border border-input bg-background px-3 py-2 text-foreground"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>

            <label className="flex flex-col gap-1 text-sm sm:col-span-2">
              <span>{t('note')}</span>
              <textarea
                className="min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-foreground"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span>{t('raidLeader')}</span>
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

            <label className="flex flex-col gap-1 text-sm">
              <span>{t('lootmaster')}</span>
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

            <label className="flex flex-col gap-1 text-sm">
              <span>{t('maxPlayers')}</span>
              <input
                type="number"
                min={1}
                max={40}
                className="rounded-md border border-input bg-background px-3 py-2 text-foreground"
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span>{t('raidGroupRestriction')}</span>
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

          <h3 className="text-base font-semibold pt-2">{t('sectionMinimum')}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(
              [
                ['minTanks', minTanks, setMinTanks],
                ['minMelee', minMelee, setMinMelee],
                ['minRange', minRange, setMinRange],
                ['minHealers', minHealers, setMinHealers],
              ] as const
            ).map(([key, val, setVal]) => (
              <label key={key} className="flex flex-col gap-1 text-sm">
                <span>{t(key)}</span>
                <input
                  type="number"
                  min={0}
                  max={25}
                  className="rounded-md border border-input bg-background px-3 py-2"
                  value={val}
                  onChange={(e) => setVal(Number(e.target.value))}
                />
              </label>
            ))}
          </div>

          <div className="space-y-2">
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
              <div key={idx} className="flex flex-wrap gap-2 items-end">
                <select
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm flex-1 min-w-[200px]"
                  value={row.spec}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMinSpecRows((rows) =>
                      rows.map((r, i) => (i === idx ? { ...r, spec: v } : r))
                    );
                  }}
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
                  className="w-20 rounded-md border border-input bg-background px-2 py-2 text-sm"
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
                  className="text-sm text-destructive hover:underline"
                  onClick={() => setMinSpecRows((rows) => rows.filter((_, i) => i !== idx))}
                >
                  {t('remove')}
                </button>
              </div>
            ))}
          </div>

          <h3 className="text-base font-semibold pt-2">{t('sectionSchedule')}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span>{t('scheduledDate')}</span>
              <input
                type="date"
                className="rounded-md border border-input bg-background px-3 py-2"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>{t('signupUntil')}</span>
              <input
                type="date"
                className="rounded-md border border-input bg-background px-3 py-2"
                value={signupDate}
                onChange={(e) => setSignupDate(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span>{t('signupUntilTime')}</span>
              <select
                className="rounded-md border border-input bg-background px-3 py-2"
                value={signupSlot}
                onChange={(e) => setSignupSlot(e.target.value)}
              >
                {TIME_SLOTS_30MIN.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1 text-sm">
            <span>{t('signupVisibility')}</span>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 max-w-md"
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

          <h3 className="text-base font-semibold pt-2">{t('sectionDiscord')}</h3>
          <label className="flex flex-col gap-1 text-sm max-w-md">
            <span>{t('threadChannel')}</span>
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

          <div className="flex flex-wrap gap-3 pt-4">
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
                if (!name.trim() || !dungeonId) {
                  setSaveError(t('validationBasics'));
                  return;
                }
                setSaveError(null);
                setStep(2);
              }}
            >
              {t('next')}
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="space-y-4 rounded-lg border border-border bg-card p-4 md:p-6">
          <h2 className="text-lg font-semibold text-foreground">{t('sectionPicker')}</h2>

          <p className="text-sm text-muted-foreground">
            {t('scheduledDate')}: {scheduledDate} · {t('currentSlot')}: {scheduledSlot}
          </p>

          <div className="overflow-x-auto pb-2">
            <div className="flex gap-1 min-w-max">
              {TIME_SLOTS_30MIN.map((slot) => {
                const active = scheduledSlot === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setScheduledSlot(slot)}
                    className={cn(
                      'shrink-0 rounded border px-2 py-1 text-xs',
                      active
                        ? 'border-primary bg-primary/15 text-foreground'
                        : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-md border border-border p-3 space-y-3 bg-muted/20">
            <p className="text-sm font-medium">{t('filters')}</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showTwinks}
                onChange={(e) => setShowTwinks(e.target.checked)}
              />
              {t('filterTwinks')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onlyMains}
                onChange={(e) => setOnlyMains(e.target.checked)}
              />
              {t('filterOnlyMains')}
            </label>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="text-muted-foreground">{t('filterWeekFocus')}</span>
              {(
                [
                  ['both', t('focusBoth')],
                  ['weekday', t('focusWeekday')],
                  ['weekend', t('focusWeekend')],
                ] as const
              ).map(([v, label]) => (
                <label key={v} className="flex items-center gap-1">
                  <input
                    type="radio"
                    name="weekFocus"
                    checked={weekFocusFilter === v}
                    onChange={() => setWeekFocusFilter(v)}
                  />
                  {label}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 items-center text-sm">
              <span className="text-muted-foreground">{t('filterRoles')}</span>
              {ROLE_ORDER.map((r) => (
                <label key={r} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={roleFilter[r]}
                    onChange={() => toggleRole(r)}
                  />
                  <RoleIcon role={r} size={18} />
                  <span>{r}</span>
                </label>
              ))}
            </div>
          </div>

          <div
            className={cn(
              'rounded-md border p-3 text-sm',
              liveStats.minOk ? 'border-green-600/50 bg-green-500/5' : 'border-amber-600/50 bg-amber-500/5'
            )}
            role="status"
          >
            <p className="font-medium">{t('liveTitle')}</p>
            <p>
              {t('liveSignups', { count: liveStats.signupCount, max: maxPlayers })}
            </p>
            <p>
              {t('liveAvailable', { n: liveStats.availablePlayers })}
            </p>
            <ul className="mt-1 list-disc list-inside text-muted-foreground">
              <li>
                Tank: {liveStats.tanks}/{minTanks} · Melee: {liveStats.melee}/{minMelee} · Range:{' '}
                {liveStats.range}/{minRange} · {t('liveHeal')}: {liveStats.healers}/{minHealers}
              </li>
              {minSpecRows.map(
                (row) =>
                  row.spec &&
                  row.count > 0 && (
                    <li key={row.spec}>
                      {row.spec}:{' '}
                      {
                        filteredPool.filter(
                          (x) =>
                            x.character.mainSpec === row.spec &&
                            (x.color === 'green' || x.color === 'orange')
                        ).length
                      }
                      /{row.count}{' '}
                      {liveStats.specOk[row.spec] ? '✓' : '✗'}
                    </li>
                  )
              )}
            </ul>
            <p className="mt-1">{liveStats.minOk ? t('liveMinOk') : t('liveMinShort')}</p>
          </div>

          <div className="space-y-6">
            {ROLE_ORDER.map((role) => {
              const list = groupedList.get(role) ?? [];
              if (list.length === 0) return null;
              return (
                <div key={role}>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <RoleIcon role={role} size={20} />
                    {role}
                  </h3>
                  <ul className="space-y-1">
                    {list.map(({ character, color }) => (
                      <li
                        key={character.id}
                        className={cn(
                          'flex flex-wrap items-center gap-2 rounded border px-2 py-1 text-sm',
                          color === 'green' && 'border-green-600/40 bg-green-500/10',
                          color === 'orange' && 'border-amber-600/40 bg-amber-500/10',
                          color === 'gray' && 'opacity-50 border-border bg-muted/30'
                        )}
                      >
                        {character.classId && (
                          <ClassIcon classId={character.classId} size={22} />
                        )}
                        <SpecIcon spec={character.mainSpec} size={22} />
                        <span className="font-medium">{character.name}</span>
                        {character.isMain ? (
                          <span className="text-xs text-muted-foreground">★</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{t('alt')}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          {saveError && (
            <p className="text-destructive text-sm" role="alert">
              {saveError}
            </p>
          )}

          <div className="flex flex-wrap gap-3 pt-4">
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
        </section>
      )}
    </div>
  );
}
