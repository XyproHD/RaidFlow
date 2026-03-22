'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { addMinutes } from '@/lib/raid-planner-time';
import { formatCompositionGaps } from '@/lib/raid-composition-summary';
import { computeTwoGroupsPossible } from '@/lib/raid-two-groups';
import { getSpecByDisplayName, type TbcRole } from '@/lib/wow-tbc-classes';
import { ClassIcon } from '@/components/class-icon';
import { SpecIcon } from '@/components/spec-icon';
import { RoleIcon } from '@/components/role-icon';
import type { LeaderPlacement } from '@/lib/raid-leader-placement';

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
  raidGroupIds: string[];
  characters: PoolCharacter[];
};

type Bootstrap = {
  dungeons: { id: string; name: string; maxPlayers: number }[];
  raidGroups: { id: string; name: string }[];
  leaders: { userId: string; label: string }[];
  groupCharAllowed: GroupCharRule[];
  members: PoolMember[];
};

export type RaidEditSignupRow = {
  id: string;
  userId: string;
  characterId: string | null;
  type: string;
  signedSpec: string | null;
  isLate: boolean;
  note: string | null;
  leaderAllowsReserve: boolean;
  leaderMarkedTeilnehmer: boolean;
  leaderPlacement: string;
  setConfirmed: boolean;
  character: {
    id: string;
    name: string;
    mainSpec: string;
    offSpec: string | null;
  } | null;
};

export type RaidEditSerialized = {
  id: string;
  guildId: string;
  dungeonId: string;
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
  status: string;
  discordThreadId: string | null;
  dungeon: { id: string; name: string };
  raidGroupRestriction: { id: string; name: string } | null;
  signups: RaidEditSignupRow[];
};

type WeekFocusFilter = 'both' | 'weekday' | 'weekend';

const ROLE_ORDER: TbcRole[] = ['Tank', 'Healer', 'Melee', 'Range'];

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

function memberPassesWeekFocus(m: PoolMember, f: WeekFocusFilter): boolean {
  if (f === 'both') return true;
  if (m.weekFocus == null) return true;
  if (f === 'weekday') return m.weekFocus === 'weekday';
  return m.weekFocus === 'weekend';
}

function placementOf(s: RaidEditSignupRow): LeaderPlacement {
  const p = s.leaderPlacement;
  if (p === 'confirmed' || p === 'substitute' || p === 'signup') return p;
  return 'signup';
}

export function RaidEditPanel({
  guildId,
  raidId,
  initialRaid,
  participationStats,
}: {
  guildId: string;
  raidId: string;
  initialRaid: RaidEditSerialized;
  participationStats: Record<string, { dungeon: number; total: number }>;
}) {
  const t = useTranslations('raidEdit');
  const tPlanner = useTranslations('raidPlanner');
  const tDetail = useTranslations('raidDetail');
  const locale = useLocale();
  const router = useRouter();

  const [raid, setRaid] = useState(initialRaid);
  useEffect(() => {
    setRaid(initialRaid);
  }, [initialRaid]);

  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState(raid.name);
  const [note, setNote] = useState(raid.note ?? '');
  const [raidLeaderId, setRaidLeaderId] = useState(raid.raidLeaderId ?? '');
  const [lootmasterId, setLootmasterId] = useState(raid.lootmasterId ?? '');
  const [minTanks, setMinTanks] = useState(raid.minTanks);
  const [minMelee, setMinMelee] = useState(raid.minMelee);
  const [minRange, setMinRange] = useState(raid.minRange);
  const [minHealers, setMinHealers] = useState(raid.minHealers);
  const [minSpecRows, setMinSpecRows] = useState<{ spec: string; count: number }[]>(() => {
    const o =
      raid.minSpecs && typeof raid.minSpecs === 'object' && !Array.isArray(raid.minSpecs)
        ? (raid.minSpecs as Record<string, number>)
        : {};
    return Object.entries(o).map(([spec, count]) => ({ spec, count }));
  });
  const [maxPlayers, setMaxPlayers] = useState(raid.maxPlayers);
  const [signupVisibility, setSignupVisibility] = useState(raid.signupVisibility);
  const [scheduledAtLocal, setScheduledAtLocal] = useState(() =>
    toDatetimeLocalValue(new Date(raid.scheduledAt))
  );
  const [scheduledEndLocal, setScheduledEndLocal] = useState(() =>
    toDatetimeLocalValue(
      raid.scheduledEndAt
        ? new Date(raid.scheduledEndAt)
        : addMinutes(new Date(raid.scheduledAt), 30)
    )
  );
  const [signupDatetimeLocal, setSignupDatetimeLocal] = useState(() =>
    toDatetimeLocalValue(parseDatetimeLocal(raid.signupUntil))
  );

  const [showTwinks, setShowTwinks] = useState(true);
  const [onlyMains, setOnlyMains] = useState(false);
  const [weekFocusFilter, setWeekFocusFilter] = useState<WeekFocusFilter>('both');
  const [roleFilter, setRoleFilter] = useState<Record<TbcRole, boolean>>({
    Tank: true,
    Healer: true,
    Melee: true,
    Range: true,
  });
  const [showAllNotes, setShowAllNotes] = useState(false);

  const [savingBasics, setSavingBasics] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [pendingSchedule, setPendingSchedule] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);

  const scheduledAtNew = useMemo(() => parseDatetimeLocal(scheduledAtLocal), [scheduledAtLocal]);
  const scheduledEndAtNew = useMemo(() => parseDatetimeLocal(scheduledEndLocal), [scheduledEndLocal]);
  const signupUntil = useMemo(
    () => parseDatetimeLocal(signupDatetimeLocal),
    [signupDatetimeLocal]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/guilds/${guildId}/raid-planner/bootstrap?locale=${encodeURIComponent(locale)}`
        );
        const json = (await res.json()) as Bootstrap & { error?: string };
        if (!res.ok) throw new Error(json.error || res.statusText);
        if (!cancelled) setBootstrap(json);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : 'load');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [guildId, locale]);

  const restrictionId = raid.raidGroupRestrictionId;

  const filteredMembers = useMemo(() => {
    if (!bootstrap) return [];
    return bootstrap.members.filter((m) => memberPassesWeekFocus(m, weekFocusFilter));
  }, [bootstrap, weekFocusFilter]);

  const compSignups = useMemo(
    () =>
      raid.signups.map((s) => ({
        type: s.type,
        signedSpec: s.signedSpec,
        character: s.character ? { mainSpec: s.character.mainSpec } : null,
      })),
    [raid.signups]
  );

  const minSpecsObj = useMemo(() => {
    const o: Record<string, number> = {};
    for (const r of minSpecRows) {
      if (r.spec && r.count > 0) o[r.spec] = r.count;
    }
    return o;
  }, [minSpecRows]);

  const gapsLine = useMemo(
    () =>
      formatCompositionGaps({
        minTanks,
        minMelee,
        minRange,
        minHealers,
        minSpecs: minSpecsObj,
        signups: compSignups,
      }),
    [minTanks, minMelee, minRange, minHealers, minSpecsObj, compSignups]
  );

  const twoGroupsOk = useMemo(
    () =>
      computeTwoGroupsPossible({
        maxPlayers,
        minTanks,
        minMelee,
        minRange,
        minHealers,
        minSpecs: minSpecsObj,
        signups: compSignups,
      }),
    [maxPlayers, minTanks, minMelee, minRange, minHealers, minSpecsObj, compSignups]
  );

  const signupUserIds = useMemo(() => new Set(raid.signups.map((s) => s.userId)), [raid.signups]);

  const addPool = useMemo(() => {
    if (!bootstrap) return [];
    return filteredMembers.filter((m) => !signupUserIds.has(m.userId));
  }, [filteredMembers, bootstrap, signupUserIds]);

  const patchSignup = useCallback(
    async (signupId: string, body: Record<string, unknown>) => {
      const res = await fetch(
        `/api/guilds/${guildId}/raids/${raidId}/signups/${signupId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || res.statusText);
      }
      router.refresh();
    },
    [guildId, raidId, router]
  );

  const postLeaderAdd = useCallback(
    async (args: {
      targetUserId: string;
      characterId: string;
      signedSpec: string;
      placement: LeaderPlacement;
    }) => {
      const res = await fetch(`/api/guilds/${guildId}/raids/${raidId}/signups/leader`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId: args.targetUserId,
          characterId: args.characterId,
          type: 'normal',
          signedSpec: args.signedSpec,
          leaderPlacement: args.placement,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || res.statusText);
      }
      router.refresh();
    },
    [guildId, raidId, router]
  );

  const saveBasics = async (opts?: { confirmResetSignups?: boolean }) => {
    setSavingBasics(true);
    setSaveErr(null);
    try {
      const origStart = new Date(raid.scheduledAt).getTime();
      const timeChanged = scheduledAtNew.getTime() !== origStart;
      const minSpecs: Record<string, number> = {};
      for (const r of minSpecRows) {
        if (r.spec && r.count > 0) minSpecs[r.spec] = r.count;
      }
      const body: Record<string, unknown> = {
        name,
        note: note || null,
        raidLeaderId: raidLeaderId || null,
        lootmasterId: lootmasterId || null,
        minTanks,
        minMelee,
        minRange,
        minHealers,
        minSpecs,
        maxPlayers,
        signupVisibility,
        scheduledAt: scheduledAtNew.toISOString(),
        scheduledEndAt: scheduledEndAtNew.toISOString(),
        signupUntil: signupUntil.toISOString(),
      };
      if (timeChanged) {
        body.confirmResetSignups = opts?.confirmResetSignups === true;
      }
      const res = await fetch(`/api/guilds/${guildId}/raids/${raidId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (
          res.status === 400 &&
          (j as { error?: string }).error?.includes('confirmResetSignups') &&
          timeChanged
        ) {
          setPendingSchedule(true);
          return;
        }
        throw new Error((j as { error?: string }).error || res.statusText);
      }
      setPendingSchedule(false);
      router.refresh();
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setSavingBasics(false);
    }
  };

  const doLock = async () => {
    if (!window.confirm(t('lockConfirm'))) return;
    setLockBusy(true);
    try {
      const res = await fetch(`/api/guilds/${guildId}/raids/${raidId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'lock' }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error);
      router.push(`/${locale}/guild/${guildId}/raid/${raidId}`);
      router.refresh();
    } finally {
      setLockBusy(false);
    }
  };

  const doCancel = async () => {
    if (!window.confirm(t('cancelConfirm'))) return;
    setCancelBusy(true);
    try {
      const res = await fetch(`/api/guilds/${guildId}/raids/${raidId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})) as { error?: string }).error);
      router.push(`/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`);
      router.refresh();
    } finally {
      setCancelBusy(false);
    }
  };

  const columnSignups = useCallback(
    (placement: LeaderPlacement) =>
      raid.signups.filter((s) => placementOf(s) === placement),
    [raid.signups]
  );

  const renderCharRow = (s: RaidEditSignupRow) => {
    const ch = s.character;
    const main = ch?.mainSpec ?? '';
    const parsed = getSpecByDisplayName(main);
    const classId = parsed?.classId ?? null;
    const specShow = s.signedSpec?.trim() || main || '?';
    const stats = participationStats[s.userId] ?? { dungeon: 0, total: 0 };
    const hasOff = !!(ch?.offSpec?.trim());

    return (
      <div
        key={s.id}
        className="rounded-md border border-border bg-background px-2 py-1.5 flex flex-wrap items-center gap-1.5 text-sm"
      >
        {classId ? (
          <span className="shrink-0 w-6 h-6 flex items-center justify-center">
            <ClassIcon classId={classId} size={20} title={main} />
          </span>
        ) : null}
        <SpecIcon spec={specShow} size={20} />
        {s.isLate ? <span title={t('late')}>⏱</span> : null}
        <span className="font-medium truncate max-w-[9rem]">{ch?.name ?? '—'}</span>
        <span className="text-muted-foreground text-xs whitespace-nowrap">
          ({stats.dungeon}/{stats.total})
        </span>
        {s.note?.trim() ? (
          <span className="text-base" title={showAllNotes || (s.note?.length ?? 0) < 40 ? s.note ?? '' : undefined}>
            {showAllNotes ? `📒 ${s.note}` : '📒'}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            className="px-1.5 py-0.5 rounded border border-border text-xs hover:bg-muted"
            title={t('toConfirmed')}
            onClick={() => void patchSignup(s.id, { leaderPlacement: 'confirmed' })}
          >
            ➕
          </button>
          <button
            type="button"
            className="px-1.5 py-0.5 rounded border border-border text-xs hover:bg-muted"
            title={t('toSubstitute')}
            onClick={() => void patchSignup(s.id, { leaderPlacement: 'substitute' })}
          >
            🪑
          </button>
          <button
            type="button"
            className="px-1.5 py-0.5 rounded border border-border text-xs hover:bg-muted"
            title={t('toSignup')}
            onClick={() => void patchSignup(s.id, { leaderPlacement: 'signup' })}
          >
            ➖
          </button>
          {hasOff ? (
            <button
              type="button"
              className="px-1.5 py-0.5 rounded border border-border text-xs hover:bg-muted"
              title={t('cycleSpec')}
              onClick={() => void patchSignup(s.id, { cycleSignedSpec: true })}
            >
              ⇄
            </button>
          ) : null}
        </div>
      </div>
    );
  };

  const [addForColumn, setAddForColumn] = useState<LeaderPlacement | null>(null);
  const [pickUser, setPickUser] = useState('');
  const [pickChar, setPickChar] = useState('');

  const openAdd = (placement: LeaderPlacement) => {
    setAddForColumn(placement);
    setPickUser('');
    setPickChar('');
  };

  const submitAdd = async () => {
    if (!addForColumn || !pickUser || !pickChar || !bootstrap) return;
    const m = bootstrap.members.find((x) => x.userId === pickUser);
    const ch = m?.characters.find((c) => c.id === pickChar);
    if (!m || !ch) return;
    const signedSpec = ch.mainSpec.trim();
    await postLeaderAdd({
      targetUserId: pickUser,
      characterId: pickChar,
      signedSpec,
      placement: addForColumn,
    });
    setAddForColumn(null);
  };

  if (loadError) {
    return <p className="text-destructive text-sm">{loadError}</p>;
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <section className="rounded-xl border border-border bg-card p-4 md:p-6 space-y-4">
        <h3 className="text-lg font-semibold border-b border-border pb-2">{t('sectionBasics')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{tPlanner('raidName')}</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{tDetail('visibility')}</span>
            <select
              className="rounded-md border border-input bg-background px-3 py-2"
              value={signupVisibility}
              onChange={(e) => setSignupVisibility(e.target.value)}
            >
              <option value="public">{tDetail('visibilityPublic')}</option>
              <option value="raid_leader_only">{tDetail('visibilityLeaders')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-muted-foreground">{tPlanner('note')}</span>
            <textarea
              className="rounded-md border border-input bg-background px-3 py-2 min-h-[4rem]"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{tPlanner('raidLeader')}</span>
            <select
              className="rounded-md border border-input bg-background px-3 py-2"
              value={raidLeaderId}
              onChange={(e) => setRaidLeaderId(e.target.value)}
            >
              <option value="">—</option>
              {(bootstrap?.leaders ?? []).map((l) => (
                <option key={l.userId} value={l.userId}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{tPlanner('lootmaster')}</span>
            <select
              className="rounded-md border border-input bg-background px-3 py-2"
              value={lootmasterId}
              onChange={(e) => setLootmasterId(e.target.value)}
            >
              <option value="">—</option>
              {(bootstrap?.leaders ?? []).map((l) => (
                <option key={l.userId} value={l.userId}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{tPlanner('maxPlayers')}</span>
            <input
              type="number"
              min={1}
              max={40}
              className="rounded-md border border-input bg-background px-3 py-2"
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{tDetail('signupUntil')}</span>
            <input
              type="datetime-local"
              className="rounded-md border border-input bg-background px-3 py-2"
              value={signupDatetimeLocal}
              onChange={(e) => setSignupDatetimeLocal(e.target.value)}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {ROLE_ORDER.map((role) => {
            const val =
              role === 'Tank'
                ? minTanks
                : role === 'Melee'
                  ? minMelee
                  : role === 'Range'
                    ? minRange
                    : minHealers;
            const set =
              role === 'Tank'
                ? setMinTanks
                : role === 'Melee'
                  ? setMinMelee
                  : role === 'Range'
                    ? setMinRange
                    : setMinHealers;
            return (
              <label key={role} className="flex flex-col gap-1 text-xs">
                <span className="text-muted-foreground flex items-center gap-1">
                  <RoleIcon role={role} size={16} />
                  {role}
                </span>
                <input
                  type="number"
                  min={0}
                  className="rounded-md border border-input bg-background px-2 py-1"
                  value={val}
                  onChange={(e) => set(Number(e.target.value))}
                />
              </label>
            );
          })}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{tPlanner('minSpecs')}</p>
          {minSpecRows.map((row, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                className="rounded-md border border-input bg-background px-2 py-1 text-sm flex-1"
                value={row.spec}
                onChange={(e) => {
                  const next = [...minSpecRows];
                  next[i] = { ...next[i], spec: e.target.value };
                  setMinSpecRows(next);
                }}
                placeholder="Spec"
              />
              <input
                type="number"
                min={0}
                className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm"
                value={row.count}
                onChange={(e) => {
                  const next = [...minSpecRows];
                  next[i] = { ...next[i], count: Number(e.target.value) };
                  setMinSpecRows(next);
                }}
              />
              <button
                type="button"
                className="text-xs text-destructive"
                onClick={() => setMinSpecRows(minSpecRows.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-sm text-primary"
            onClick={() => setMinSpecRows([...minSpecRows, { spec: '', count: 1 }])}
          >
            + Spec
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">{t('terminSection')}</p>
          <p className="text-xs text-muted-foreground">{t('terminHint')}</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t('raidStart')}</span>
              <input
                type="datetime-local"
                className="rounded-md border border-input bg-background px-3 py-2"
                value={scheduledAtLocal}
                onChange={(e) => setScheduledAtLocal(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t('raidEnd')}</span>
              <input
                type="datetime-local"
                className="rounded-md border border-input bg-background px-3 py-2"
                value={scheduledEndLocal}
                onChange={(e) => setScheduledEndLocal(e.target.value)}
              />
            </label>
          </div>
        </div>

        {saveErr ? <p className="text-destructive text-sm">{saveErr}</p> : null}
        {pendingSchedule ? (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm space-y-2">
            <p>{t('resetSignupsWarning')}</p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm"
                onClick={() => void saveBasics({ confirmResetSignups: true })}
              >
                {t('confirmReset')}
              </button>
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-sm"
                onClick={() => setPendingSchedule(false)}
              >
                {t('abort')}
              </button>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          disabled={savingBasics}
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
          onClick={() => void saveBasics()}
        >
          {savingBasics ? t('saving') : t('saveBasics')}
        </button>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">{tPlanner('filters')}</span>
          <button
            type="button"
            role="switch"
            aria-checked={showTwinks}
            onClick={() => setShowTwinks((v) => !v)}
            className={cn(
              'relative inline-flex h-6 w-11 shrink-0 rounded-full border border-input',
              showTwinks ? 'bg-primary' : 'bg-muted'
            )}
          >
            <span
              className={cn(
                'inline-block h-5 w-5 rounded-full bg-background shadow translate-x-0.5 mt-0.5 transition',
                showTwinks && 'translate-x-5'
              )}
            />
          </button>
          <span className="text-sm text-muted-foreground">{tPlanner('filterTwinks')}</span>
          <label className="flex items-center gap-1 text-sm">
            <input
              type="checkbox"
              checked={onlyMains}
              onChange={(e) => setOnlyMains(e.target.checked)}
            />
            {tPlanner('filterOnlyMains')}
          </label>
          <select
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
            value={weekFocusFilter}
            onChange={(e) => setWeekFocusFilter(e.target.value as WeekFocusFilter)}
          >
            <option value="both">{tPlanner('focusBoth')}</option>
            <option value="weekday">{tPlanner('focusWeekday')}</option>
            <option value="weekend">{tPlanner('focusWeekend')}</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          {ROLE_ORDER.map((role) => (
            <label key={role} className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={roleFilter[role]}
                onChange={(e) =>
                  setRoleFilter((f) => ({ ...f, [role]: e.target.checked }))
                }
              />
              <RoleIcon role={role} size={16} />
              {role}
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap justify-between gap-2">
          <p className="text-sm">
            <span className="text-muted-foreground">{t('liveGaps')}:</span> {gapsLine}
          </p>
          <p className="text-sm">
            <span className="text-muted-foreground">{t('twoGroups')}:</span>{' '}
            {twoGroupsOk ? t('twoGroupsYes') : t('twoGroupsNo')}
          </p>
        </div>
        <button
          type="button"
          className="text-sm text-primary underline"
          onClick={() => setShowAllNotes((v) => !v)}
        >
          {showAllNotes ? t('hideAllNotes') : t('showAllNotes')}
        </button>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        {(['confirmed', 'substitute', 'signup'] as const).map((col) => (
          <div key={col} className="rounded-xl border border-border bg-muted/30 p-3 space-y-2 min-h-[12rem]">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold text-sm">
                {col === 'confirmed'
                  ? t('columnConfirmed')
                  : col === 'substitute'
                    ? t('columnSubstitute')
                    : t('columnSignup')}
              </h4>
              <button
                type="button"
                className="text-xs rounded-md border border-border px-2 py-1 hover:bg-muted"
                onClick={() => openAdd(col)}
              >
                {t('add')}
              </button>
            </div>
            <div className="space-y-2">{columnSignups(col).map(renderCharRow)}</div>
          </div>
        ))}
      </section>

      {addForColumn ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-xl p-4 max-w-md w-full space-y-3">
            <h4 className="font-semibold">{t('addPlayer')}</h4>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2"
              value={pickUser}
              onChange={(e) => {
                setPickUser(e.target.value);
                setPickChar('');
              }}
            >
              <option value="">{t('pickMember')}</option>
              {addPool.map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.characters[0]?.name ?? m.userId.slice(0, 8)}
                </option>
              ))}
            </select>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2"
              value={pickChar}
              onChange={(e) => setPickChar(e.target.value)}
              disabled={!pickUser}
            >
              <option value="">{t('pickChar')}</option>
              {(bootstrap?.members.find((x) => x.userId === pickUser)?.characters ?? [])
                .filter((c) => showTwinks || c.isMain)
                .filter((c) => {
                  if (!restrictionId) return true;
                  const mem = bootstrap!.members.find((x) => x.userId === pickUser)!;
                  return charAllowedInRestrictedGroup(c.id, mem, restrictionId, bootstrap!.groupCharAllowed);
                })
                .filter((c) => {
                  const anyRoleOn = ROLE_ORDER.some((r) => roleFilter[r]);
                  if (!anyRoleOn) return false;
                  const r = c.role;
                  return r ? roleFilter[r] : true;
                })
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.mainSpec})
                  </option>
                ))}
            </select>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-sm"
                onClick={() => setAddForColumn(null)}
              >
                {t('abort')}
              </button>
              <button
                type="button"
                className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm"
                onClick={() => void submitAdd()}
                disabled={!pickUser || !pickChar}
              >
                {t('add')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="flex flex-wrap gap-3">
        <button
          type="button"
          className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
          disabled={lockBusy}
          onClick={() => void doLock()}
        >
          {lockBusy ? '…' : t('lockRaid')}
        </button>
        <button
          type="button"
          className="rounded-md border border-destructive text-destructive px-4 py-2 text-sm font-medium disabled:opacity-50"
          disabled={cancelBusy}
          onClick={() => void doCancel()}
        >
          {cancelBusy ? '…' : t('cancelRaid')}
        </button>
      </section>
    </div>
  );
}
