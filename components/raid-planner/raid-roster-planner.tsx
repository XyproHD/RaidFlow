'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { formatRaidTerminLine } from '@/lib/format-raid-termin';
import { TBC_CLASS_IDS, type TbcRole } from '@/lib/wow-tbc-classes';
import { ClassIcon } from '@/components/class-icon';
import { SpecIcon } from '@/components/spec-icon';
import { RoleIcon } from '@/components/role-icon';
import { CharacterMainStar } from '@/components/character-main-star';
import { SignupSpecIcons } from '@/components/raid-detail/signup-spec-icons';
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
type AttendanceFilter = 'all' | 'available' | 'maybe' | 'late';

export type RosterPlannerSignup = {
  id: string;
  characterId?: string | null;
  name: string;
  mainSpec: string;
  offSpec?: string | null;
  classId: string | null;
  isMain: boolean;
  role: TbcRole;
  signedSpec?: string | null;
  onlySignedSpec?: boolean;
  /** DB: normal | uncertain | reserve (main treated as normal) */
  signupType: string;
  isLate: boolean;
  discordName?: string | null;
  gearScore?: number | null;
  note?: string | null;
  /** Profil-Fokus Werktag/Wochenende; fehlt = beide Filter erlauben */
  profileWeekFocus?: 'weekday' | 'weekend' | null;
};

export type GuildCharacterOption = {
  id: string;
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

function findDropZone(x: number, y: number): 'roster' | 'reserve' | 'pool' | null {
  const stack = document.elementsFromPoint(x, y);
  for (const el of stack) {
    if (!(el instanceof HTMLElement)) continue;
    const z = el.dataset.dropZone;
    if (z === 'roster' || z === 'reserve' || z === 'pool') return z;
  }
  return null;
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
}) {
  const t = useTranslations('raidDetail');
  const tEdit = useTranslations('raidEdit');
  const tRoster = useTranslations('raidRosterPlanner');
  const tPlanner = useTranslations('raidPlanner');
  const tProfile = useTranslations('profile');
  const router = useRouter();
  const intlLocale = useLocale();

  const [signups, setSignups] = useState<RosterPlannerSignup[]>(() => initialSignups);
  useEffect(() => setSignups(initialSignups), [initialSignups]);

  const byId = useMemo(() => new Map(signups.map((s) => [s.id, s])), [signups]);

  const [rosterOrder, setRosterOrder] = useState<string[]>([]);
  const [reserveOrder, setReserveOrder] = useState<string[]>([]);

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
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>('all');

  const [leaderMenuOpen, setLeaderMenuOpen] = useState(false);
  const [leaderMenuPos, setLeaderMenuPos] = useState<{ top: number; left: number } | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState('');
  const [addSelectedId, setAddSelectedId] = useState<string | null>(null);

  const [dragSession, setDragSession] = useState<DragSession | null>(null);
  const [dragPoint, setDragPoint] = useState<{ clientX: number; clientY: number } | null>(null);
  const [flyBack, setFlyBack] = useState<FlyBackState | null>(null);

  const rosterListRef = useRef<HTMLDivElement>(null);

  const scheduledAt = useMemo(() => new Date(raid.scheduledAt), [raid.scheduledAt]);
  const scheduledEndAt = raid.scheduledEndAt ? new Date(raid.scheduledEndAt) : null;
  const dateShort = new Intl.DateTimeFormat(intlLocale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(scheduledAt);
  const raidTermin = formatRaidTerminLine(intlLocale, scheduledAt, scheduledEndAt);

  const rosterRoleCounts = useMemo(() => {
    const out: Record<(typeof ROLE_KEYS)[number], number> = { Tank: 0, Melee: 0, Range: 0, Healer: 0 };
    for (const id of rosterOrder) {
      const s = byId.get(id);
      if (!s) continue;
      const r = s.role;
      if (r === 'Tank' || r === 'Melee' || r === 'Range' || r === 'Healer') out[r] += 1;
    }
    return out;
  }, [rosterOrder, byId]);

  const rosterSpecCounts = useMemo(() => {
    const out = new Map<string, number>();
    for (const id of rosterOrder) {
      const s = byId.get(id);
      if (!s) continue;
      const spec = (s.signedSpec?.trim() || s.mainSpec?.trim() || '').trim();
      if (!spec) continue;
      out.set(spec, (out.get(spec) ?? 0) + 1);
    }
    return out;
  }, [rosterOrder, byId]);

  const rosterMinFulfillmentRatio = useMemo(() => {
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
      ratios.push(Math.min(1, (rosterSpecCounts.get(spec) ?? 0) / need));
    }
    if (ratios.length === 0) return null;
    return ratios.reduce((a, b) => a + b, 0) / ratios.length;
  }, [overviewProps, rosterRoleCounts, rosterSpecCounts]);

  const poolIds = useMemo(() => {
    const placed = new Set([...rosterOrder, ...reserveOrder]);
    return signups.map((s) => s.id).filter((id) => !placed.has(id));
  }, [signups, rosterOrder, reserveOrder]);

  const passesAttendance = useCallback(
    (s: RosterPlannerSignup) => {
      const tn = typeNorm(s.signupType);
      if (attendanceFilter === 'all') return true;
      if (attendanceFilter === 'available') return tn === 'normal';
      if (attendanceFilter === 'maybe') return tn === 'uncertain';
      if (attendanceFilter === 'late') return s.isLate;
      return true;
    },
    [attendanceFilter]
  );

  const addCandidates = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    const all = guildCharacters;
    if (!q) return all.slice(0, 50);
    return all
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 50);
  }, [addQuery, guildCharacters]);

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
      return passesCharFilters(s) && passesAttendance(s);
    });
  }, [poolIds, byId, passesCharFilters, passesAttendance]);

  const filteredReserveIds = useMemo(() => {
    return reserveOrder.filter((id) => {
      const s = byId.get(id);
      if (!s) return false;
      return passesCharFilters(s) && passesAttendance(s);
    });
  }, [reserveOrder, byId, passesCharFilters, passesAttendance]);

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
      const target = findDropZone(e.clientX, e.clientY);
      const id = sess.signupId;
      const origin = sess.originRect;

      const applyPool = () => {
        setRosterOrder((o) => o.filter((x) => x !== id));
        setReserveOrder((o) => o.filter((x) => x !== id));
      };

      if (target === 'pool') {
        applyPool();
        endDrag();
        return;
      }

      if (target === 'reserve') {
        setRosterOrder((o) => o.filter((x) => x !== id));
        setReserveOrder((o) => (o.includes(id) ? o : [...o, id]));
        endDrag();
        return;
      }

      if (target === 'roster') {
        const el = rosterListRef.current;
        const insertAt = el ? rosterInsertIndex(el, e.clientY, id) : 0;
        setReserveOrder((o) => o.filter((x) => x !== id));
        setRosterOrder((o) => {
          const without = o.filter((x) => x !== id);
          const next = [...without];
          next.splice(insertAt, 0, id);
          return next;
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
  }, [dragSession, endDrag]);

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
        <SignupSpecIcons
          character={{ mainSpec: s.mainSpec, offSpec: s.offSpec ?? null }}
          signedSpec={s.signedSpec ?? null}
          onlySignedSpec={!!s.onlySignedSpec}
          viewerIsRaidLeader={true}
        />
        <span className="font-medium min-w-0 truncate">{s.name}</span>
        <span className="ml-auto flex items-center gap-2">
          {s.discordName ? (
            <span
              className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground max-w-[9rem] truncate"
              title={s.discordName}
            >
              {s.discordName}
            </span>
          ) : null}
          {typeof s.gearScore === 'number' ? (
            <span
              className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground tabular-nums"
              title="Gearscore"
            >
              GS {s.gearScore}
            </span>
          ) : null}
        </span>
        {s.isLate ? (
          <span className="text-xs text-muted-foreground shrink-0" title={t('lateCheckbox')}>
            ⏱
          </span>
        ) : null}
      </div>
    );
  }

  const draggedSignup = dragSession ? byId.get(dragSession.signupId) : null;

  function addManualSignup() {
    if (!addSelected) return;
    const id = `manual:${addSelected.id}`;
    setSignups((prev) => {
      if (prev.some((x) => x.id === id)) return prev;
      const row: RosterPlannerSignup = {
        id,
        characterId: addSelected.id,
        name: addSelected.name,
        mainSpec: addSelected.mainSpec,
        offSpec: addSelected.offSpec,
        classId: addSelected.classId,
        isMain: addSelected.isMain,
        role: addSelected.role,
        signedSpec: null,
        onlySignedSpec: false,
        signupType: 'normal',
        isLate: false,
        discordName: addSelected.guildDiscordDisplayName,
        gearScore: addSelected.gearScore,
        note: `Gesetzt von Raidleader ${raidLeaderLabel}`,
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

      <div className="flex flex-col xl:flex-row gap-4 items-start">
        <aside
          className={cn(
            'w-full xl:w-64 shrink-0 rounded-xl border border-border bg-muted/15 p-4 space-y-3 transition-opacity duration-200',
            dragActive && 'opacity-35 pointer-events-none'
          )}
        >
          <p className="text-sm font-medium border-b border-border pb-2">{tPlanner('filters')}</p>

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
            <span className="text-muted-foreground text-xs">{tRoster('filterAttendance')}</span>
            <div className="flex rounded-lg border border-border p-0.5 bg-muted/30 flex-wrap">
              {(
                [
                  ['all', tRoster('attendanceAll')],
                  ['available', tRoster('attendanceAvailable')],
                  ['maybe', tRoster('attendanceMaybe')],
                  ['late', tRoster('attendanceLate')],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAttendanceFilter(v)}
                  className={cn(
                    'rounded-md px-2 py-1.5 text-xs sm:text-sm flex-1 min-w-[4.5rem]',
                    attendanceFilter === v
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="flex-1 min-w-0 grid grid-cols-1 lg:grid-cols-2 gap-4 w-full">
          <div className="space-y-4 min-w-0">
            <div
              data-drop-zone="roster"
              className={cn(
                'rounded-xl border border-border bg-card/40 shadow-sm overflow-hidden min-h-[120px] transition-[box-shadow] duration-200',
                dragActive && 'ring-2 ring-primary/45 ring-offset-2 ring-offset-background'
              )}
            >
              <div className="border-b border-border bg-muted/20 px-4 py-3 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-sm font-semibold text-foreground">{tRoster('rosterTitle')}</h2>
                  <div className={cn('text-lg font-bold tabular-nums leading-none', toneForFulfillment(rosterMinFulfillmentRatio))}>
                    {rosterOrder.length} / {raid.maxPlayers}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                  {ROLE_KEYS.map((roleKey) => {
                    const need = overviewProps.roleMinByKey[roleKey] ?? 0;
                    if (need <= 0) return null;
                    const cur = rosterRoleCounts[roleKey] ?? 0;
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
                        .map(([spec, need]) => {
                          const cur = rosterSpecCounts.get(spec) ?? 0;
                          return (
                            <span key={spec} className="inline-flex items-center gap-1.5">
                              <SpecIcon spec={spec} size={16} />
                              <span className={cn('font-semibold tabular-nums', cur < need ? 'text-destructive' : 'text-foreground')}>
                                {countToMinLabel(cur, need)}
                              </span>
                            </span>
                          );
                        })
                    : null}
                </div>
              </div>
              <div ref={rosterListRef} className="p-3 space-y-2" role="list">
                {rosterOrder.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-1 py-4 text-center">{tRoster('rosterEmpty')}</p>
                ) : (
                  rosterOrder.map((id, i) => {
                    const s = byId.get(id);
                    if (!s) return null;
                    return renderRow(s, 'roster', i);
                  })
                )}
              </div>
            </div>

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
              <SignupSpecIcons
                character={{ mainSpec: draggedSignup.mainSpec, offSpec: draggedSignup.offSpec ?? null }}
                signedSpec={draggedSignup.signedSpec ?? null}
                onlySignedSpec={!!draggedSignup.onlySignedSpec}
                viewerIsRaidLeader={true}
              />
              <span className="font-medium truncate">{draggedSignup.name}</span>
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
                    <SignupSpecIcons
                      character={{ mainSpec: s.mainSpec, offSpec: s.offSpec ?? null }}
                      signedSpec={s.signedSpec ?? null}
                      onlySignedSpec={!!s.onlySignedSpec}
                      viewerIsRaidLeader={true}
                    />
                    <span className="font-medium truncate">{s.name}</span>
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
                                  <SpecIcon spec={c.mainSpec} size={18} />
                                  {c.offSpec ? (
                                    <SpecIcon
                                      spec={c.offSpec}
                                      size={18}
                                      className="grayscale contrast-200 brightness-75"
                                    />
                                  ) : null}
                                </span>
                                <span className="font-medium truncate">{c.name}</span>
                                <span className="ml-auto flex items-center gap-2">
                                  {c.guildDiscordDisplayName ? (
                                    <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground max-w-[9rem] truncate">
                                      {c.guildDiscordDisplayName}
                                    </span>
                                  ) : null}
                                  {typeof c.gearScore === 'number' ? (
                                    <span className="rounded border border-border bg-muted/50 px-1.5 py-0.5 text-[10px] font-bold text-muted-foreground tabular-nums">
                                      GS {c.gearScore}
                                    </span>
                                  ) : null}
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
