'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';
import { ProfileCharacters, type ProfileCharactersHandle, type CharacterRow as ProfileCharacterRow, type GuildOption as ProfileGuildOption } from '../profile/profile-characters';
import { ClassIcon } from '@/components/class-icon';
import { RoleIcon } from '@/components/role-icon';
import { TBC_CLASSES, getSpecByDisplayName } from '@/lib/wow-tbc-classes';
import { CharacterMainStar } from '@/components/character-main-star';
import { CharacterGearscoreBadge } from '@/components/character-gearscore-badge';
import { BattlenetLogo } from '@/components/battlenet-logo';
import { CharacterNameBadges, CharacterSpecIconsInline } from '@/components/character-display-parts';
import { cn } from '@/lib/utils';

export type DashboardGuild = {
  id: string;
  name: string;
  role: 'guildmaster' | 'raidleader' | 'raider' | 'member';
  armoryUrl: string | null;
  realmLabel: string | null;
  canManage: boolean;
  battlenetRealmId?: string | null;
};

export type DashboardCharacter = {
  id: string;
  name: string;
  guildId: string | null;
  guildName: string | null;
  hasBattlenet: boolean;
  gearScore: number | null;
  mainSpec: string;
  offSpec: string | null;
  classId: string | null;
  isMain: boolean;
  participatedRaids: number;
  lootCount: number;
  battlenetRealmSlug: string | null;
};

export type DashboardSignupRow = {
  raidId: string;
  guildId: string;
  raidName: string;
  dungeonName: string;
  guildName: string;
  scheduledAtIso: string;
  signedCharacterId: string | null;
  signedCharacterName: string | null;
  signedSpec: string | null;
  raidStatus: string;
  leaderPlacement: string;
  setConfirmed: boolean;
  characterMainSpec: string | null;
  characterOffSpec: string | null;
  characterHasBattlenet: boolean;
  characterGearScore: number | null;
  characterIsMain: boolean | null;
  type: string;
};

export type DashboardCalendarRaid = {
  id: string;
  guildId: string;
  guildName: string;
  name: string;
  dungeonName: string;
  scheduledAtIso: string;
  signupUntilIso: string;
  status: string;
  signupCount: number;
  maxPlayers: number;
  hasNote: boolean;
  note: string | null;
  canEdit: boolean;
  /** Bei Status announced und >1 Gruppe: Anzahl für Kalender-Badge. */
  announcedGroupCount: number | null;
  mySignup: null | {
    id: string;
    leaderPlacement: string;
    setConfirmed: boolean;
  };
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function formatDayLabel(locale: string, d: Date) {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: '2-digit', month: '2-digit' }).format(d);
}

function formatTime(locale: string, d: Date) {
  return new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(d);
}

function guildRoleBadges(
  t: ReturnType<typeof useTranslations>,
  role: DashboardGuild['role']
): { key: string; label: string }[] {
  if (role === 'guildmaster') {
    return [
      { key: 'guildmaster', label: t('roleGuildmaster') },
      { key: 'raidleader', label: t('roleRaidleader') },
      { key: 'raider', label: t('roleRaider') },
    ];
  }
  if (role === 'raidleader') {
    return [
      { key: 'raidleader', label: t('roleRaidleader') },
      { key: 'raider', label: t('roleRaider') },
    ];
  }
  if (role === 'raider') return [{ key: 'raider', label: t('roleRaider') }];
  return [];
}

function myStatusIcon(raidStatus: string, mySignup: DashboardCalendarRaid['mySignup']): '⌛' | '⚠️' | '✅' | '🪑' | null {
  if (!mySignup) return null;
  if (raidStatus !== 'locked' && raidStatus !== 'announced') return '⌛';
  if (mySignup.leaderPlacement === 'substitute') return '🪑';
  if (mySignup.setConfirmed) return '✅';
  return '⚠️';
}

function myStatusIconTooltip(raidStatus: string, mySignup: DashboardCalendarRaid['mySignup']): string {
  if (!mySignup) return '';
  if (raidStatus !== 'locked' && raidStatus !== 'announced') return 'Angemeldet – warte auf Bestätigung durch die Raidleitung';
  if (mySignup.leaderPlacement === 'substitute') return 'Als Ersatzspieler eingeteilt';
  if (mySignup.setConfirmed) return 'Angemeldet und vom Raidleiter bestätigt';
  return 'Angemeldet – noch nicht bestätigt';
}

function daysDiff(raidDate: Date, referenceDay: Date): number {
  const ms = startOfDay(raidDate).getTime() - startOfDay(referenceDay).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function roleForSpecDisplayName(specDisplayName: string | null): string | null {
  if (!specDisplayName) return null;
  const parsed = getSpecByDisplayName(specDisplayName);
  if (!parsed) return null;
  const cls = TBC_CLASSES.find((c) => c.id === parsed.classId);
  const spec = cls?.specs.find((s) => s.id === parsed.specId);
  return spec?.role ?? null;
}

function signupIndicator(
  signupUntilIso: string,
  raidStatus: string
): { icon: '🟢' | '🟡' | '🔴'; isClosed: boolean } {
  if (raidStatus === 'announced' || raidStatus === 'locked') {
    return { icon: '🔴', isClosed: true };
  }
  const remainingMs = new Date(signupUntilIso).getTime() - Date.now();
  if (remainingMs <= 0) return { icon: '🔴', isClosed: true };
  if (remainingMs < 30 * 60 * 60 * 1000) return { icon: '🟡', isClosed: false };
  return { icon: '🟢', isClosed: false };
}

export function DashboardClient({
  guilds,
  characters,
  signups,
  calendarRaids,
  canCreateGuildIds,
}: {
  guilds: DashboardGuild[];
  characters: DashboardCharacter[];
  signups: DashboardSignupRow[];
  calendarRaids: DashboardCalendarRaid[];
  canCreateGuildIds: string[];
}) {
  const t = useTranslations('dashboard');
  const tRaidDetail = useTranslations('raidDetail');
  const raidStatusLabel = (st: string) => {
    if (st === 'open') return tRaidDetail('raidStatus_open');
    if (st === 'announced') return tRaidDetail('raidStatus_announced');
    if (st === 'locked') return tRaidDetail('raidStatus_locked');
    if (st === 'cancelled') return tRaidDetail('raidStatus_cancelled');
    return st;
  };

  const WITHDRAW_REASON_MIN = 10;
  async function calendarWithdrawSignup(r: DashboardCalendarRaid) {
    let opts: RequestInit = { method: 'DELETE' };
    if (r.status === 'announced' && r.mySignup?.setConfirmed) {
      const reason = window.prompt(tRaidDetail('withdrawReasonHint'), '');
      if (reason === null) return;
      if (reason.trim().length < WITHDRAW_REASON_MIN) {
        window.alert(tRaidDetail('withdrawReasonMin', { n: WITHDRAW_REASON_MIN }));
        return;
      }
      opts = {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ withdrawReason: reason.trim() }),
      };
    }
    await fetch(
      `/api/guilds/${encodeURIComponent(r.guildId)}/raids/${encodeURIComponent(r.id)}/signups`,
      opts
    );
    router.refresh();
  }

  const tProfile = useTranslations('profile');
  const locale = useLocale();
  const router = useRouter();
  const profileCharactersRef = useRef<ProfileCharactersHandle>(null);
  const [expandedNoteRaidId, setExpandedNoteRaidId] = useState<string | null>(null);
  const [openCharMenuId, setOpenCharMenuId] = useState<string | null>(null);
  const [openCharMenuPos, setOpenCharMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [openSignupMenuKey, setOpenSignupMenuKey] = useState<string | null>(null);
  const [openSignupMenuPos, setOpenSignupMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [openNewRaidMenuPos, setOpenNewRaidMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [openCalendarActionRaidId, setOpenCalendarActionRaidId] = useState<string | null>(null);
  const [openCalendarActionPos, setOpenCalendarActionPos] = useState<{ top: number; left: number } | null>(null);
  const [expandedSignupUntilRaidId, setExpandedSignupUntilRaidId] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<'tiles' | 'list'>('tiles');
  const [showDays, setShowDays] = useState<7 | 14 | 21>(14);
  const [calendarAnchor, setCalendarAnchor] = useState<Date>(() => startOfDay(new Date()));
  const [listCount, setListCount] = useState(5);
  const [listStartIdx, setListStartIdx] = useState<number | null>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const rangeStart = useMemo(() => startOfDay(addDays(calendarAnchor, -1)), [calendarAnchor]);
  const tilesCount = useMemo(() => showDays + 1, [showDays]);
  const rangeEnd = useMemo(() => startOfDay(addDays(rangeStart, tilesCount - 1)), [rangeStart, tilesCount]);
  const defaultCreateGuildId = canCreateGuildIds[0] ?? null;
  const canCreateGuilds = useMemo(
    () => guilds.filter((g) => (g.role === 'raidleader' || g.role === 'guildmaster') && canCreateGuildIds.includes(g.id)),
    [guilds, canCreateGuildIds]
  );

  const closeAllMenus = () => {
    setOpenCharMenuId(null);
    setOpenCharMenuPos(null);
    setOpenSignupMenuKey(null);
    setOpenSignupMenuPos(null);
    setOpenNewRaidMenuPos(null);
    setOpenCalendarActionRaidId(null);
    setOpenCalendarActionPos(null);
  };

  async function handleCharSetMain(id: string) {
    await fetch(`/api/user/characters/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ isMain: true }),
    });
    closeAllMenus();
    router.refresh();
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeAllMenus();
    };
    const onPointerDown = (e: MouseEvent) => {
      // If a click happens inside a menu, the menu container stops propagation.
      closeAllMenus();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);
    window.addEventListener('scroll', closeAllMenus, true);
    window.addEventListener('resize', closeAllMenus);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('scroll', closeAllMenus, true);
      window.removeEventListener('resize', closeAllMenus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openMenuAtButton(btn: HTMLButtonElement) {
    const r = btn.getBoundingClientRect();
    const width = 176; // ~w-44
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width));
    const top = Math.min(window.innerHeight - 8, r.bottom + 6);
    return { top, left };
  }

  const days = useMemo(() => {
    const list: Date[] = [];
    for (let i = 0; i < tilesCount; i++) list.push(addDays(rangeStart, i));
    return list;
  }, [rangeStart, tilesCount]);

  const visibleCalendarRaids = useMemo(() => {
    const startMs = startOfDay(rangeStart).getTime();
    const endMs = startOfDay(rangeEnd).getTime();
    return calendarRaids.filter((r) => {
      const d = startOfDay(new Date(r.scheduledAtIso)).getTime();
      return d >= startMs && d <= endMs;
    });
  }, [calendarRaids, rangeStart, rangeEnd]);

  const raidsByDay = useMemo(() => {
    const map = new Map<string, DashboardCalendarRaid[]>();
    for (const r of visibleCalendarRaids) {
      const d = startOfDay(new Date(r.scheduledAtIso));
      const key = d.toISOString();
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    for (const [k, arr] of map) {
      arr.sort((a, b) => new Date(a.scheduledAtIso).getTime() - new Date(b.scheduledAtIso).getTime());
      map.set(k, arr);
    }
    return map;
  }, [visibleCalendarRaids]);

  const calendarRaidsSorted = useMemo(() => {
    return [...visibleCalendarRaids].sort((a, b) => new Date(a.scheduledAtIso).getTime() - new Date(b.scheduledAtIso).getTime());
  }, [visibleCalendarRaids]);

  const allRaidsSorted = useMemo(
    () => [...calendarRaids].sort((a, b) => new Date(a.scheduledAtIso).getTime() - new Date(b.scheduledAtIso).getTime()),
    [calendarRaids]
  );

  const todayIdx = useMemo(() => {
    const ms = today.getTime();
    const idx = allRaidsSorted.findIndex((r) => startOfDay(new Date(r.scheduledAtIso)).getTime() >= ms);
    return idx === -1 ? allRaidsSorted.length : idx;
  }, [allRaidsSorted, today]);

  const effectiveListStart = useMemo(
    () => (listStartIdx !== null ? listStartIdx : todayIdx),
    [listStartIdx, todayIdx]
  );

  const listRaids = useMemo(
    () => allRaidsSorted.slice(effectiveListStart, effectiveListStart + listCount),
    [allRaidsSorted, effectiveListStart, listCount]
  );

  const canGoListPrev = effectiveListStart > 0;
  const canGoListNext = effectiveListStart + listCount < allRaidsSorted.length;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-foreground tracking-tight">{t('title')}</h1>

      <section aria-labelledby="guild-memberships-heading" className="rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border border-l-[3px] border-l-amber-400/60 bg-amber-500/10 dark:bg-amber-500/[0.07]">
          <h2 id="guild-memberships-heading" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            {t('guildMemberships')}
          </h2>
        </div>
        {guilds.length === 0 ? (
          <p className="px-5 py-4 text-muted-foreground text-sm">{t('noGuildMembership')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {guilds.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 hover:bg-muted/20 transition-colors">
                <div className="min-w-0 flex items-center gap-2">
                  <div className="min-w-0">
                    {g.armoryUrl ? (
                      <a
                        href={g.armoryUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-foreground hover:underline truncate block"
                        title={g.name}
                      >
                        {g.name}
                      </a>
                    ) : (
                      <span className="font-semibold text-foreground truncate block" title={g.name}>
                        {g.name}
                      </span>
                    )}
                    {g.realmLabel ? (
                      <div className="text-xs text-muted-foreground truncate" title={g.realmLabel}>
                        @ {g.realmLabel.includes('•') ? g.realmLabel.split('•').pop()?.trim() : g.realmLabel}
                      </div>
                    ) : null}
                  </div>
                  {g.armoryUrl ? (
                    <a
                      href={g.armoryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center rounded border border-border bg-background px-1.5 py-1 hover:bg-muted"
                      aria-label="classic-armory.org"
                      title="classic-armory.org"
                    >
                      <img src="https://favicon.pub/classic-armory.org" alt="classic-armory.org favicon" className="h-4 w-4" />
                    </a>
                  ) : null}
                  <div className="flex flex-wrap gap-1">
                    {guildRoleBadges(t, g.role).map((b) => (
                      <span
                        key={`${g.id}:${b.key}`}
                        className={cn(
                          'text-xs rounded-full px-2 py-0.5 font-medium border',
                          b.key === 'guildmaster'
                            ? 'bg-amber-500/15 border-amber-500/30 text-amber-700 dark:text-amber-400'
                            : b.key === 'raidleader'
                              ? 'bg-primary/10 border-primary/30 text-primary'
                              : 'bg-muted/50 border-border text-muted-foreground'
                        )}
                      >
                        {b.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  {g.canManage ? (
                    <Link
                      href={`/${locale}/guilds?guild=${encodeURIComponent(g.id)}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition-colors"
                      aria-label={t('openGuildManagement')}
                      title={t('openGuildManagement')}
                    >
                      <svg className="h-4 w-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="my-stats-heading" className="rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border border-l-[3px] border-l-blue-400/60 bg-blue-500/10 dark:bg-blue-500/[0.07]">
          <h2 id="my-stats-heading" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            {t('myStats')}
          </h2>
          <button
            type="button"
            onClick={() => profileCharactersRef.current?.openAdd()}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
          >
            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {tProfile('addCharacter')}
          </button>
        </div>
        {characters.length === 0 ? (
          <p className="px-5 py-4 text-muted-foreground text-sm">{t('noCharacters')}</p>
        ) : (
          <div className="divide-y divide-border">
            {characters.map((c) => {
              const menuOpen = openCharMenuId === c.id;
              return (
                <div key={c.id} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/20 transition-colors">
                  <div className="flex shrink-0 items-center justify-center w-5 h-5">
                    <CharacterMainStar
                      isMain={!!c.isMain}
                      titleMain={tProfile('mainLabel')}
                      titleAlt={tProfile('altLabel')}
                      sizePx={14}
                    />
                  </div>
                  <div className="flex shrink-0 items-center justify-center">
                    {c.classId ? <ClassIcon classId={c.classId} size={20} title={c.mainSpec} /> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <CharacterSpecIconsInline
                      mainSpec={c.mainSpec}
                      offSpec={c.offSpec}
                      size={18}
                      slashClassName="hidden"
                      offSpecIconClassName="opacity-70"
                    />
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <span className="font-medium text-sm text-foreground truncate" title={c.name}>{c.name}</span>
                    {c.hasBattlenet ? <BattlenetLogo size={14} title={tProfile('bnetLinkedBadgeTitle')} /> : null}
                    <CharacterGearscoreBadge
                      characterId={c.id}
                      hasBattlenet={c.hasBattlenet}
                      gearScore={c.gearScore}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground hidden sm:block shrink-0 truncate max-w-[110px]" title={c.guildName ?? undefined}>{c.guildName ?? '–'}</span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0" title={t('participatedRaids')}>
                    {c.participatedRaids}× Raids
                  </span>
                  <button
                    type="button"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label={tProfile('characterMenu')}
                    aria-expanded={menuOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      const pos = openMenuAtButton(e.currentTarget);
                      setOpenCharMenuPos(pos);
                      setOpenCharMenuId(menuOpen ? null : c.id);
                      setOpenSignupMenuKey(null);
                      setOpenSignupMenuPos(null);
                      setOpenNewRaidMenuPos(null);
                      setOpenCalendarActionRaidId(null);
                      setOpenCalendarActionPos(null);
                    }}
                  >
                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <ProfileCharacters
          ref={profileCharactersRef}
          initialData={characters.map((c): ProfileCharacterRow => ({
            id: c.id,
            name: c.name,
            guildId: c.guildId,
            guildName: c.guildName,
            gearScore: c.gearScore,
            mainSpec: c.mainSpec,
            offSpec: c.offSpec,
            isMain: c.isMain,
            classId: c.classId,
            hasBattlenet: c.hasBattlenet,
            battlenetRealmSlug: c.battlenetRealmSlug,
          }))}
          guilds={guilds.map((g): ProfileGuildOption => ({
            id: g.id,
            name: g.name,
            battlenetRealmId: g.battlenetRealmId,
          }))}
          modalOnly={true}
        />
      </section>

      <section aria-labelledby="my-signups-heading" className="rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border border-l-[3px] border-l-emerald-400/60 bg-emerald-500/10 dark:bg-emerald-500/[0.07]">
          <h2 id="my-signups-heading" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            {t('mySignups')}
          </h2>
        </div>
        {signups.length === 0 ? (
          <p className="px-5 py-4 text-muted-foreground text-sm">{t('mySignupsEmpty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr className="text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('scheduledAt')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('status')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('raid')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('character')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('myStatus')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {signups.map((s) => {
                  const key = `${s.guildId}:${s.raidId}`;
                  const statusIcon = myStatusIcon(s.raidStatus, {
                    id: 'x',
                    leaderPlacement: s.leaderPlacement,
                    setConfirmed: s.setConfirmed,
                  });
                  const specForIcon = s.signedSpec ?? s.characterMainSpec ?? null;
                  // We rely on SpecIcon's own lookup; ClassIcon needs classId, derive from signedSpec/mainSpec if present.
                  const derivedClassId = specForIcon ? (getSpecByDisplayName(specForIcon)?.classId ?? null) : null;
                  const role = roleForSpecDisplayName(specForIcon);
                  const menuOpen = openSignupMenuKey === key;

                  return (
                    <tr
                      key={key}
                      className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3 align-top text-muted-foreground tabular-nums text-sm">
                        {new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(s.scheduledAtIso))}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground align-top">
                        <span className="text-xs capitalize">{s.raidStatus}</span>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Link
                          href={`/${locale}/guild/${s.guildId}/raid/${s.raidId}`}
                          className="block min-w-0"
                        >
                          <div className="font-medium text-foreground hover:underline truncate" title={`${s.raidName} - ${s.dungeonName}`}>
                            {s.raidName} - {s.dungeonName}
                          </div>
                          <div className="text-xs text-muted-foreground truncate" title={s.guildName}>
                            {s.guildName}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 align-top">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 hover:bg-muted min-w-0 transition-colors"
                          onClick={() => router.push(`/${locale}/guild/${s.guildId}/raid/${s.raidId}?mode=signup`)}
                          title={t('signupEdit')}
                        >
                          {role ? <RoleIcon role={role} size={18} /> : null}
                          <span className="flex items-center gap-1 shrink-0">
                            {derivedClassId ? <ClassIcon classId={derivedClassId} size={22} title={specForIcon ?? undefined} /> : null}
                            {specForIcon ? (
                              <CharacterSpecIconsInline
                                mainSpec={specForIcon}
                                offSpec={s.characterOffSpec}
                                size={20}
                                slashClassName="hidden"
                                offSpecWrapperClassName="grayscale contrast-90 inline-flex"
                                offSpecIconClassName="opacity-90"
                              />
                            ) : null}
                          </span>
                          {s.characterIsMain != null ? (
                            <CharacterMainStar
                              isMain={!!s.characterIsMain}
                              titleMain={tProfile('mainLabel')}
                              titleAlt={tProfile('altLabel')}
                              sizePx={16}
                            />
                          ) : null}
                          <CharacterNameBadges
                            name={s.signedCharacterName ?? '–'}
                            hasBattlenet={s.characterHasBattlenet}
                            characterId={s.signedCharacterId ?? ''}
                            gearScore={s.characterGearScore}
                            wrapperClassName="contents"
                            nameClassName="font-medium text-foreground truncate"
                            bnetTitle={t('bnetLinkedBadgeTitle')}
                          />
                        </button>
                      </td>
                      <td className="px-4 py-3 align-top">
                        {statusIcon ? (
                          <span className="text-xs text-muted-foreground">
                            Meine Anmeldung:{' '}
                            <span
                              className="cursor-help text-base align-middle"
                              title={myStatusIconTooltip(s.raidStatus, { id: 'x', leaderPlacement: s.leaderPlacement, setConfirmed: s.setConfirmed })}
                            >
                              {statusIcon}
                            </span>
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition-colors text-muted-foreground"
                          aria-label={t('actions')}
                          title={t('actions')}
                          onClick={(e) => {
                            e.stopPropagation();
                            const pos = openMenuAtButton(e.currentTarget);
                            setOpenSignupMenuPos(pos);
                            setOpenNewRaidMenuPos(null);
                            setOpenSignupMenuKey(menuOpen ? null : key);
                          }}
                        >
                          ⋮
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openCharMenuId && openCharMenuPos
        ? createPortal(
            <div
              style={{ position: 'fixed', top: openCharMenuPos.top, left: openCharMenuPos.left, zIndex: 1000 }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {(() => {
                const char = characters.find((x) => x.id === openCharMenuId);
                if (!char) return null;
                const canSetMain = !!char.guildId && !char.isMain;
                return (
                  <div className="w-44 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
                    <div className="px-1 py-1">
                      {canSetMain && (
                        <button
                          type="button"
                          className="w-full text-left flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                          onClick={() => void handleCharSetMain(char.id)}
                        >
                          {tProfile('setAsMain')}
                        </button>
                      )}
                      <button
                        type="button"
                        className="w-full text-left flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                        onClick={() => {
                          profileCharactersRef.current?.openEdit({
                            id: char.id,
                            name: char.name,
                            guildId: char.guildId,
                            guildName: char.guildName,
                            gearScore: char.gearScore,
                            mainSpec: char.mainSpec,
                            offSpec: char.offSpec,
                            isMain: char.isMain,
                            classId: char.classId,
                            hasBattlenet: char.hasBattlenet,
                            battlenetRealmSlug: char.battlenetRealmSlug,
                          });
                          closeAllMenus();
                        }}
                      >
                        {tProfile('editCharacter')}
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>,
            document.body
          )
        : null}

      {openSignupMenuKey && openSignupMenuPos
        ? createPortal(
            <div
              style={{ position: 'fixed', top: openSignupMenuPos.top, left: openSignupMenuPos.left, zIndex: 1000 }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {(() => {
                const [guildId, raidId] = openSignupMenuKey.split(':');
                return (
                  <div className="w-44 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
                    <Link
                      href={`/${locale}/guild/${encodeURIComponent(guildId)}/raid/${encodeURIComponent(raidId)}?mode=signup`}
                      className="flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors"
                      onClick={() => closeAllMenus()}
                    >
                      {t('signupEdit')}
                    </Link>
                    <button
                      type="button"
                      className="w-full text-left flex items-center gap-2 px-4 py-2.5 text-sm hover:bg-muted transition-colors text-destructive"
                      onClick={async () => {
                        await fetch(
                          `/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}/signups`,
                          { method: 'DELETE' }
                        );
                        closeAllMenus();
                        router.refresh();
                      }}
                    >
                      ➖ {t('signupWithdraw')}
                    </button>
                  </div>
                );
              })()}
            </div>,
            document.body
          )
        : null}

      <section aria-labelledby="calendar-heading" className="rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-5 py-4 border-b border-border border-l-[3px] border-l-violet-400/60 bg-violet-500/10 dark:bg-violet-500/[0.07]">
          <h2 id="calendar-heading" className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            {t('calendar')}
          </h2>

          {/* Filters centered */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            {calendarView === 'tiles' ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
                <span className="text-xs text-muted-foreground">{t('showDays')}</span>
                {[7, 14, 21].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setShowDays(n as 7 | 14 | 21)}
                    className={
                      showDays === n
                        ? 'rounded px-2 py-1 text-xs font-semibold bg-muted text-foreground'
                        : 'rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
                <span className="text-xs text-muted-foreground">Nächste</span>
                {[5, 7, 10].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setListCount(n)}
                    className={
                      listCount === n
                        ? 'rounded px-2 py-1 text-xs font-semibold bg-muted text-foreground'
                        : 'rounded px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }
                  >
                    {n}
                  </button>
                ))}
                <span className="text-xs text-muted-foreground">Raids</span>
              </div>
            )}

            {calendarView === 'tiles' ? (
              <div className="flex items-center gap-1 rounded-md border border-border bg-card px-1 py-1">
                <button
                  type="button"
                  className="h-8 w-8 rounded hover:bg-muted"
                  aria-label={t('prevWeek')}
                  title={t('prevWeek')}
                  onClick={() => setCalendarAnchor((d) => addDays(d, -7))}
                >
                  &lt;
                </button>
                <div className="px-2 text-xs text-muted-foreground min-w-[10rem] text-center">
                  {new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(rangeStart)} –{' '}
                  {new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(rangeEnd)}
                </div>
                <button
                  type="button"
                  className="h-8 w-8 rounded hover:bg-muted"
                  aria-label={t('nextWeek')}
                  title={t('nextWeek')}
                  onClick={() => setCalendarAnchor((d) => addDays(d, 7))}
                >
                  &gt;
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1 rounded-md border border-border bg-card px-1 py-1">
                <button
                  type="button"
                  className={cn('h-8 w-8 rounded', canGoListPrev ? 'hover:bg-muted' : 'opacity-30 cursor-not-allowed')}
                  disabled={!canGoListPrev}
                  aria-label="Vorherige Raids"
                  title="Vorherige Raids"
                  onClick={() => setListStartIdx(Math.max(0, effectiveListStart - listCount))}
                >
                  &lt;
                </button>
                <div className="px-2 text-xs text-muted-foreground min-w-[10rem] text-center">
                  {listRaids.length > 0 ? (
                    <>
                      {new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(new Date(listRaids[0].scheduledAtIso))}
                      {listRaids.length > 1 ? (
                        <>
                          {' '}–{' '}
                          {new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(new Date(listRaids[listRaids.length - 1].scheduledAtIso))}
                        </>
                      ) : null}
                    </>
                  ) : (
                    <span>Keine Raids</span>
                  )}
                </div>
                <button
                  type="button"
                  className={cn('h-8 w-8 rounded', canGoListNext ? 'hover:bg-muted' : 'opacity-30 cursor-not-allowed')}
                  disabled={!canGoListNext}
                  aria-label="Nächste Raids"
                  title="Nächste Raids"
                  onClick={() => setListStartIdx(Math.min(allRaidsSorted.length - listCount, effectiveListStart + listCount))}
                >
                  &gt;
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5">
              <button
                type="button"
                onClick={() => setCalendarView('tiles')}
                className={calendarView === 'tiles' ? 'text-sm font-semibold text-foreground' : 'text-sm text-muted-foreground hover:text-foreground'}
              >
                {t('calendarTiles')}
              </button>
              <span className="text-muted-foreground text-xs">|</span>
              <button
                type="button"
                onClick={() => { setCalendarView('list'); setListStartIdx(null); }}
                className={calendarView === 'list' ? 'text-sm font-semibold text-foreground' : 'text-sm text-muted-foreground hover:text-foreground'}
              >
                {t('calendarList')}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            {canCreateGuilds.length > 0 ? (
              <button
                type="button"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 shadow-sm transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  const pos = openMenuAtButton(e.currentTarget);
                  setOpenNewRaidMenuPos(pos);
                  setOpenSignupMenuKey(null);
                  setOpenSignupMenuPos(null);
                }}
              >
                + {t('newRaid')}
              </button>
            ) : null}
          </div>
        </div>

        {calendarView === 'tiles' ? (
        <div className="p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 items-start">
            {days.map((day) => {
              const key = startOfDay(day).toISOString();
              const raids = raidsByDay.get(key) ?? [];
              const isToday = startOfDay(day).getTime() === today.getTime();
              const isPast = startOfDay(day).getTime() < today.getTime();
              return (
                <div
                  key={key}
                  className={[
                    'rounded-xl border bg-card p-3 shadow-sm',
                    isToday ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border',
                    isPast ? 'opacity-55' : '',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-foreground">
                      {formatDayLabel(locale, day)} {isToday ? <span className="text-xs text-primary font-semibold ml-0.5">({t('todayShort')})</span> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">{raids.length}</div>
                  </div>
                  <div className="mt-2 divide-y divide-border/50">
                    {raids.length === 0 ? (
                      <div className="text-sm text-muted-foreground">{t('calendarEmptyDay')}</div>
                    ) : (
                      raids.map((r) => {
                        const status = myStatusIcon(r.status, r.mySignup);
                        const noteOpen = expandedNoteRaidId === r.id;
                        const timeLabel = formatTime(locale, new Date(r.scheduledAtIso));
                        const signupUntilDateTimeLabel = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(
                          new Date(r.signupUntilIso)
                        );
                        const signupState = signupIndicator(r.signupUntilIso, r.status);
                        const signupUntilOpen = expandedSignupUntilRaidId === r.id;
                        return (
                          <div key={r.id} className="pt-2.5 pb-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Link
                                    href={`/${locale}/guild/${r.guildId}/raid/${r.id}`}
                                    className="font-medium text-foreground hover:text-primary transition-colors block truncate text-sm"
                                    title={r.name}
                                  >
                                    {r.name}
                                  </Link>
                                  <span className="text-xs text-muted-foreground shrink-0">{timeLabel}</span>
                                </div>
                                <div className="text-xs text-muted-foreground truncate" title={`${r.dungeonName} • ${r.guildName}`}>
                                  {r.dungeonName} • {r.guildName}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  <span>Raidstatus: <span className="font-medium text-foreground/80">{raidStatusLabel(r.status)}</span></span>
                                  {r.announcedGroupCount != null ? (
                                    <span> · {tRaidDetail('dashboardGroupCount', { n: r.announcedGroupCount })}</span>
                                  ) : null}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  <button
                                    type="button"
                                    className="inline-flex items-center gap-1 hover:text-foreground"
                                    title={signupUntilDateTimeLabel}
                                    onClick={() => setExpandedSignupUntilRaidId(signupUntilOpen ? null : r.id)}
                                  >
                                    <span>Anmeldung:</span>
                                    <span>{signupState.icon}</span>
                                  </button>
                                  {signupUntilOpen ? <div className="mt-1 text-[11px]">{signupUntilDateTimeLabel}</div> : null}
                                </div>
                              </div>
                              <div className="ml-auto flex items-center gap-2">
                                {r.canEdit ? (
                                  <button
                                    type="button"
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition-colors text-muted-foreground"
                                    aria-label={t('actions')}
                                    title={t('actions')}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const pos = openMenuAtButton(e.currentTarget);
                                      setOpenCalendarActionPos(pos);
                                      setOpenCalendarActionRaidId(openCalendarActionRaidId === r.id ? null : r.id);
                                      setOpenSignupMenuKey(null);
                                      setOpenSignupMenuPos(null);
                                      setOpenNewRaidMenuPos(null);
                                    }}
                                  >
                                    <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                                  </button>
                                ) : null}
                                {r.hasNote ? (
                                  <button
                                    type="button"
                                    className="shrink-0 rounded-lg border border-border bg-card px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                    onClick={() => setExpandedNoteRaidId(noteOpen ? null : r.id)}
                                    aria-label={t('toggleNote')}
                                    title={t('toggleNote')}
                                  >
                                    📒
                                  </button>
                                ) : null}
                              </div>
                            </div>

                            {noteOpen ? (
                              <div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
                                {r.note?.trim() ? r.note : t('noteHint')}
                              </div>
                            ) : null}

                            <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-border/50">
                              <div className="text-xs text-muted-foreground">
                                {status ? (
                                  <span>
                                    Meine Anmeldung:{' '}
                                    <span
                                      className="cursor-help text-base align-middle"
                                      title={myStatusIconTooltip(r.status, r.mySignup)}
                                    >
                                      {status}
                                    </span>
                                  </span>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-1.5">
                                {!r.mySignup ? (
                                  r.status === 'open' || r.status === 'announced' ? (
                                    <Link
                                      href={`/${locale}/guild/${r.guildId}/raid/${r.id}?mode=signup`}
                                      className="inline-flex items-center gap-1 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                                      aria-label={t('signupStart')}
                                      title={t('signupStart')}
                                    >
                                      + {t('signupStart')}
                                    </Link>
                                  ) : null
                                ) : (
                                  <>
                                    {r.status === 'open' || r.status === 'announced' ? (
                                      <>
                                        <Link
                                          href={`/${locale}/guild/${r.guildId}/raid/${r.id}?mode=signup`}
                                          className="inline-flex items-center justify-center rounded-lg border border-border bg-card h-6 w-6 hover:bg-muted transition-colors text-muted-foreground"
                                          aria-label={t('signupEdit')}
                                          title={t('signupEdit')}
                                        >
                                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                        </Link>
                                        <button
                                          type="button"
                                          className="inline-flex items-center justify-center rounded-lg border border-border bg-card h-6 w-6 hover:bg-muted transition-colors text-muted-foreground"
                                          aria-label={t('signupWithdraw')}
                                          title={t('signupWithdraw')}
                                          onClick={() => void calendarWithdrawSignup(r)}
                                        >
                                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                        </button>
                                      </>
                                    ) : null}
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="mt-1.5 text-xs text-muted-foreground">
                              <span className="tabular-nums">{r.signupCount}/{r.maxPlayers}</span> {t('signups')}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        ) : listRaids.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">Keine Raids in diesem Zeitraum</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="border-b border-border bg-muted/30">
                <tr className="text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('scheduledAt')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('raid')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Anmeldung bis</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('status')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('myStatus')}</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Schnellaktion</th>
                  <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {listRaids.map((r) => {
                  const status = myStatusIcon(r.status, r.mySignup);
                  const timeLabel = formatTime(locale, new Date(r.scheduledAtIso));
                  const signupUntilLabel = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(
                    new Date(r.signupUntilIso)
                  );
                  const signupState = signupIndicator(r.signupUntilIso, r.status);
                  const diff = daysDiff(new Date(r.scheduledAtIso), today);
                  const isToday = diff === 0;
                  return (
                    <tr
                      key={r.id}
                      className={cn(
                        'border-b border-border last:border-b-0 transition-colors',
                        isToday
                          ? 'bg-primary/5 hover:bg-primary/8'
                          : 'hover:bg-muted/20'
                      )}
                    >
                      <td className="px-4 py-3 tabular-nums text-sm">
                        <div className={isToday ? 'font-semibold text-primary' : 'text-muted-foreground'}>
                          {new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(new Date(r.scheduledAtIso))}{' '}
                          <span className="text-xs">{timeLabel}</span>
                          {isToday ? <span className="ml-1 text-xs font-semibold text-primary">({t('todayShort')})</span> : null}
                        </div>
                        {!isToday && (
                          diff < 0 ? (
                            <div className="text-[11px] text-red-400/80 dark:text-red-400/60 tabular-nums">
                              vor {Math.abs(diff)} {Math.abs(diff) === 1 ? 'Tag' : 'Tagen'}
                            </div>
                          ) : (
                            <div className="text-[11px] text-emerald-600/80 dark:text-emerald-400/70 tabular-nums">
                              in {diff} {diff === 1 ? 'Tag' : 'Tagen'}
                            </div>
                          )
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/${locale}/guild/${r.guildId}/raid/${r.id}`} className="font-medium text-foreground hover:text-primary transition-colors">
                          {r.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{r.dungeonName}</div>
                        <div className="text-xs text-muted-foreground">@ {r.guildName}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        <span title={signupUntilLabel}>Anmeldung: {signupState.icon}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        <span>Raidstatus: <span className="font-medium text-foreground/80">{raidStatusLabel(r.status)}</span></span>
                        {r.announcedGroupCount != null ? (
                          <span className="block">
                            {tRaidDetail('dashboardGroupCount', { n: r.announcedGroupCount })}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {status ? (
                          <span className="text-xs text-muted-foreground">
                            Meine Anmeldung:{' '}
                            <span
                              className="cursor-help text-base align-middle"
                              title={myStatusIconTooltip(r.status, r.mySignup)}
                            >
                              {status}
                            </span>
                          </span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {!r.mySignup ? (
                          r.status === 'open' || r.status === 'announced' ? (
                            <Link
                              href={`/${locale}/guild/${r.guildId}/raid/${r.id}?mode=signup`}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                              title={t('signupStart')}
                              aria-label={t('signupStart')}
                            >
                              + Anmelden
                            </Link>
                          ) : null
                        ) : r.status === 'open' || r.status === 'announced' ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                            title={t('signupWithdraw')}
                            aria-label={t('signupWithdraw')}
                            onClick={() => void calendarWithdrawSignup(r)}
                          >
                            Abmelden
                          </button>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition-colors text-muted-foreground"
                          title={t('actions')}
                          aria-label={t('actions')}
                          onClick={(e) => {
                            e.stopPropagation();
                            const pos = openMenuAtButton(e.currentTarget);
                            setOpenCalendarActionPos(pos);
                            setOpenCalendarActionRaidId(openCalendarActionRaidId === r.id ? null : r.id);
                            setOpenSignupMenuKey(null);
                            setOpenSignupMenuPos(null);
                            setOpenNewRaidMenuPos(null);
                          }}
                        >
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openCalendarActionRaidId && openCalendarActionPos
        ? createPortal(
            <>
              <div className="fixed inset-0 z-[995] bg-black/20" onMouseDown={() => closeAllMenus()} />
              <div
                style={{ position: 'fixed', top: openCalendarActionPos.top, left: openCalendarActionPos.left, zIndex: 1000 }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {(() => {
                  const raid = calendarRaids.find((x) => x.id === openCalendarActionRaidId);
                  if (!raid) return null;
                  return (
                    <div className="w-52 rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
                      <div className="px-1 py-1">
                      {raid.status === 'open' || raid.status === 'announced' ? (
                        <Link
                          href={`/${locale}/guild/${raid.guildId}/raid/${raid.id}?mode=signup`}
                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                          onClick={() => closeAllMenus()}
                        >
                          {raid.mySignup ? t('signupEdit') : t('signupStart')}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground">Anmeldung gesperrt</div>
                      )}
                      {raid.canEdit ? (
                        <>
                          <div className="h-px bg-border mx-1 my-1" />
                          <button
                            type="button"
                            className="w-full text-left flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                            onClick={() => {
                              closeAllMenus();
                              router.push(`/${locale}/guild/${raid.guildId}/raid/${raid.id}/plan`);
                            }}
                          >
                            {tRaidDetail('menuPlan')}
                          </button>
                          <Link
                            href={`/${locale}/guild/${raid.guildId}/raid/${raid.id}?mode=edit`}
                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                            onClick={() => closeAllMenus()}
                          >
                            {t('raidEdit')}
                          </Link>
                          {raid.status === 'open' || raid.status === 'announced' ? (
                            <button
                              type="button"
                              className="w-full text-left flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                              onClick={async () => {
                                await fetch(
                                  `/api/guilds/${encodeURIComponent(raid.guildId)}/raids/${encodeURIComponent(raid.id)}`,
                                  {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ action: 'cancel' }),
                                  }
                                );
                                closeAllMenus();
                                router.refresh();
                              }}
                            >
                              Raid absagen
                            </button>
                          ) : null}
                          <div className="h-px bg-border mx-1 my-1" />
                          <button
                            type="button"
                            className="w-full text-left flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                            onClick={async () => {
                              await fetch(
                                `/api/guilds/${encodeURIComponent(raid.guildId)}/raids/${encodeURIComponent(raid.id)}`,
                                { method: 'DELETE' }
                              );
                              closeAllMenus();
                              router.refresh();
                            }}
                          >
                            Raid löschen
                          </button>
                        </>
                      ) : null}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </>,
            document.body
          )
        : null}

      {openNewRaidMenuPos
        ? createPortal(
            <div
              style={{ position: 'fixed', top: openNewRaidMenuPos.top, left: openNewRaidMenuPos.left, zIndex: 1000 }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="w-56 rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
                <div className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide border-b border-border">{t('newRaid')}</div>
                <div className="px-1 py-1">
                {canCreateGuilds.map((g) => (
                  <Link
                    key={g.id}
                    href={`/${locale}/guild/${encodeURIComponent(g.id)}/raid/new`}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                    onClick={() => closeAllMenus()}
                  >
                    {t('createSingleRaid')} — {g.name}
                  </Link>
                ))}
                <div className="h-px bg-border mx-1 my-1" />
                <button
                  type="button"
                  disabled
                  className="w-full text-left flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground opacity-50 cursor-not-allowed"
                  title={t('createMultiRaidSoon')}
                >
                  {t('createMultiRaid')}
                </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

