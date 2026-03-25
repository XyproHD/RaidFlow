'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { createPortal } from 'react-dom';
import { ClassIcon } from '@/components/class-icon';
import { SpecIcon } from '@/components/spec-icon';
import { RoleIcon } from '@/components/role-icon';
import { TBC_CLASSES, getSpecByDisplayName } from '@/lib/wow-tbc-classes';
import { CharacterMainStar } from '@/components/character-main-star';

export type DashboardGuild = {
  id: string;
  name: string;
  role: 'guildmaster' | 'raidleader' | 'raider' | 'member';
  armoryUrl: string | null;
  realmLabel: string | null;
  canManage: boolean;
};

export type DashboardCharacter = {
  id: string;
  name: string;
  guildName: string | null;
  mainSpec: string;
  offSpec: string | null;
  classId: string | null;
  isMain: boolean;
  participatedRaids: number;
  lootCount: number;
};

export type DashboardSignupRow = {
  raidId: string;
  guildId: string;
  raidName: string;
  dungeonName: string;
  guildName: string;
  scheduledAtIso: string;
  signedCharacterName: string | null;
  signedSpec: string | null;
  raidStatus: string;
  leaderPlacement: string;
  setConfirmed: boolean;
  characterMainSpec: string | null;
  characterOffSpec: string | null;
  characterHasBattlenet: boolean;
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
  if (raidStatus !== 'locked') return '⌛';
  if (mySignup.leaderPlacement === 'substitute') return '🪑';
  if (mySignup.setConfirmed) return '✅';
  return '⚠️';
}

function roleForSpecDisplayName(specDisplayName: string | null): string | null {
  if (!specDisplayName) return null;
  const parsed = getSpecByDisplayName(specDisplayName);
  if (!parsed) return null;
  const cls = TBC_CLASSES.find((c) => c.id === parsed.classId);
  const spec = cls?.specs.find((s) => s.id === parsed.specId);
  return spec?.role ?? null;
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
  const tProfile = useTranslations('profile');
  const locale = useLocale();
  const router = useRouter();
  const [expandedNoteRaidId, setExpandedNoteRaidId] = useState<string | null>(null);
  const [openSignupMenuKey, setOpenSignupMenuKey] = useState<string | null>(null);
  const [openSignupMenuPos, setOpenSignupMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [openNewRaidMenuPos, setOpenNewRaidMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [calendarView, setCalendarView] = useState<'tiles' | 'list'>('tiles');
  const [showDays, setShowDays] = useState<7 | 14 | 21>(14);
  const [calendarAnchor, setCalendarAnchor] = useState<Date>(() => startOfDay(new Date()));

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
    setOpenSignupMenuKey(null);
    setOpenSignupMenuPos(null);
    setOpenNewRaidMenuPos(null);
  };

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

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>

      <section aria-labelledby="guild-memberships-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="guild-memberships-heading" className="text-lg font-semibold text-foreground">
            {t('guildMemberships')}
          </h2>
        </div>
        {guilds.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('noGuildMembership')}</p>
        ) : (
          <ul className="grid gap-2">
            {guilds.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border bg-card px-3 py-2">
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
                        className="text-xs rounded border border-border px-1.5 py-0.5 text-muted-foreground"
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
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-muted"
                      aria-label={t('openGuildManagement')}
                      title={t('openGuildManagement')}
                    >
                      ⚙️
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="my-stats-heading" className="space-y-3">
        <h2 id="my-stats-heading" className="text-lg font-semibold text-foreground">
          {t('myStats')}
        </h2>
        {characters.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('noCharacters')}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {characters.map((c) => (
              <div key={c.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex shrink-0 items-center justify-center w-6 h-10">
                    <CharacterMainStar
                      isMain={!!c.isMain}
                      titleMain={tProfile('mainLabel')}
                      titleAlt={tProfile('altLabel')}
                      sizePx={18}
                    />
                  </div>
                  <div className="flex shrink-0 items-center justify-center w-10 h-10 rounded-md bg-muted/40">
                    {c.classId ? <ClassIcon classId={c.classId} size={28} title={c.mainSpec} /> : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex items-center gap-1 shrink-0">
                        <SpecIcon spec={c.mainSpec} size={22} />
                        {c.offSpec ? (
                          <span className="grayscale contrast-90 inline-flex">
                            <SpecIcon spec={c.offSpec} size={22} className="opacity-90" />
                          </span>
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground truncate" title={c.name}>
                          {c.name}
                        </div>
                        <div className="text-xs text-muted-foreground truncate" title={c.guildName ?? undefined}>
                          {c.guildName ?? '–'}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-md bg-muted/30 px-2 py-1.5">
                    <div className="text-xs text-muted-foreground">{t('participatedRaids')}</div>
                    <div className="font-semibold text-foreground">{c.participatedRaids}</div>
                  </div>
                  <div className="rounded-md bg-muted/30 px-2 py-1.5">
                    <div className="text-xs text-muted-foreground">{t('lootReceived')}</div>
                    <div className="font-semibold text-foreground">{c.lootCount}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="my-signups-heading" className="space-y-3">
        <h2 id="my-signups-heading" className="text-lg font-semibold text-foreground">
          {t('mySignups')}
        </h2>
        {signups.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('mySignupsEmpty')}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="border-b border-border bg-muted/20">
                <tr className="text-left">
                  <th className="px-3 py-2">{t('scheduledAt')}</th>
                  <th className="px-3 py-2">{t('status')}</th>
                  <th className="px-3 py-2">{t('raid')}</th>
                  <th className="px-3 py-2">{t('character')}</th>
                  <th className="px-3 py-2">{t('myStatus')}</th>
                  <th className="px-3 py-2 text-right">{t('actions')}</th>
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
                      className="border-b border-border last:border-b-0 odd:bg-background even:bg-muted/10 hover:bg-muted/20"
                    >
                      <td className="px-3 py-2 align-top text-muted-foreground">
                        {new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(s.scheduledAtIso))}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground align-top">
                        <span className="capitalize">{s.raidStatus}</span>
                      </td>
                      <td className="px-3 py-2 align-top">
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
                      <td className="px-3 py-2 align-top">
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 hover:bg-muted min-w-0"
                          onClick={() => router.push(`/${locale}/guild/${s.guildId}/raid/${s.raidId}?mode=signup`)}
                          title={t('signupEdit')}
                        >
                          {role ? <RoleIcon role={role} size={18} /> : null}
                          <span className="flex items-center gap-1 shrink-0">
                            {derivedClassId ? <ClassIcon classId={derivedClassId} size={22} title={specForIcon ?? undefined} /> : null}
                            {specForIcon ? <SpecIcon spec={specForIcon} size={20} /> : null}
                            {s.characterOffSpec ? (
                              <span className="grayscale contrast-90 inline-flex">
                                <SpecIcon spec={s.characterOffSpec} size={20} className="opacity-90" />
                              </span>
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
                          <span className="font-medium text-foreground truncate">{s.signedCharacterName ?? '–'}</span>
                          {s.characterHasBattlenet ? (
                            <span
                              className="shrink-0 rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                              title={t('bnetLinkedBadgeTitle')}
                            >
                              {t('bnetLinkedBadge')}
                            </span>
                          ) : null}
                        </button>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {statusIcon ? (
                          <span title={t('myStatus')} className="text-base">
                            {statusIcon}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{t('notSignedUp')}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        <button
                          type="button"
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-muted"
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

      {openSignupMenuKey && openSignupMenuPos
        ? createPortal(
            <div
              style={{ position: 'fixed', top: openSignupMenuPos.top, left: openSignupMenuPos.left, zIndex: 1000 }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {(() => {
                const [guildId, raidId] = openSignupMenuKey.split(':');
                return (
                  <div className="w-44 rounded-md border border-border bg-background shadow-md overflow-hidden">
                    <Link
                      href={`/${locale}/guild/${encodeURIComponent(guildId)}/raid/${encodeURIComponent(raidId)}?mode=signup`}
                      className="block px-3 py-2 text-sm hover:bg-muted"
                      onClick={() => closeAllMenus()}
                    >
                      ⚙️ {t('signupEdit')}
                    </Link>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted text-destructive"
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

      <section aria-labelledby="calendar-heading" className="space-y-3">
        <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
          <h2 id="calendar-heading" className="text-lg font-semibold text-foreground">
            {t('calendar')}
          </h2>

          {/* Filters centered */}
          <div className="flex flex-wrap items-center justify-center gap-2">
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
                onClick={() => setCalendarView('list')}
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
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
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
                    'rounded-lg border bg-card p-3',
                    isToday ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-900/10' : 'border-border',
                    isPast ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-foreground">
                      {formatDayLabel(locale, day)} {isToday ? <span className="text-xs text-emerald-700 dark:text-emerald-400">({t('todayShort')})</span> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">{raids.length}</div>
                  </div>
                  <div className="mt-2 space-y-2">
                    {raids.length === 0 ? (
                      <div className="text-sm text-muted-foreground">{t('calendarEmptyDay')}</div>
                    ) : (
                      raids.map((r) => {
                        const status = myStatusIcon(r.status, r.mySignup);
                        const noteOpen = expandedNoteRaidId === r.id;
                        const timeLabel = formatTime(locale, new Date(r.scheduledAtIso));
                        const signupUntilLabel = formatTime(locale, new Date(r.signupUntilIso));
                        const signupUntilDateLabel = new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(new Date(r.signupUntilIso));
                        return (
                          <div key={r.id} className="rounded-md border border-border bg-background px-2 py-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Link
                                    href={`/${locale}/guild/${r.guildId}/raid/${r.id}`}
                                    className="font-semibold text-foreground hover:underline block truncate"
                                    title={r.name}
                                  >
                                    {r.name}
                                  </Link>
                                  <span className="text-xs text-muted-foreground shrink-0">{timeLabel}</span>
                                </div>
                                <div className="text-xs text-muted-foreground truncate" title={`${r.dungeonName} • ${r.guildName}`}>
                                  {r.dungeonName} • {r.guildName}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                  <span className="capitalize">{r.status}</span>
                                </div>
                                {r.status === 'open' ? (
                                  <div className="mt-1 text-xs text-muted-foreground">
                                    {t('signupOpenUntil')}: {signupUntilDateLabel} {signupUntilLabel}
                                  </div>
                                ) : null}
                              </div>
                              <div className="ml-auto flex items-center gap-2">
                                {r.canEdit ? (
                                  <Link
                                    href={`/${locale}/guild/${r.guildId}/raid/${r.id}?mode=edit`}
                                    className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-sm hover:bg-muted"
                                    aria-label={t('raidEdit')}
                                    title={t('raidEdit')}
                                  >
                                    ✏️
                                  </Link>
                                ) : null}
                                {r.hasNote ? (
                                  <button
                                    type="button"
                                    className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-sm hover:bg-muted"
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

                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div className="text-sm">
                                {status ? (
                                  <span title={t('myStatus')}>{status}</span>
                                ) : (
                                  <span className="text-muted-foreground">{t('notSignedUp')}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {!r.mySignup ? (
                                  <Link
                                    href={`/${locale}/guild/${r.guildId}/raid/${r.id}?mode=signup`}
                                    className="inline-flex items-center justify-center rounded-md border border-border bg-background px-2 py-1 text-sm hover:bg-muted"
                                    aria-label={t('signupStart')}
                                    title={t('signupStart')}
                                  >
                                    ➕
                                  </Link>
                                ) : (
                                  <>
                                    <Link
                                      href={`/${locale}/guild/${r.guildId}/raid/${r.id}?mode=signup`}
                                      className="inline-flex items-center justify-center rounded-md border border-border bg-background px-2 py-1 text-sm hover:bg-muted"
                                      aria-label={t('signupEdit')}
                                      title={t('signupEdit')}
                                    >
                                      ⚙️
                                    </Link>
                                    <button
                                      type="button"
                                      className="inline-flex items-center justify-center rounded-md border border-border bg-background px-2 py-1 text-sm hover:bg-muted"
                                      aria-label={t('signupWithdraw')}
                                      title={t('signupWithdraw')}
                                      onClick={async () => {
                                        await fetch(
                                          `/api/guilds/${encodeURIComponent(r.guildId)}/raids/${encodeURIComponent(r.id)}/signups`,
                                          { method: 'DELETE' }
                                        );
                                        router.refresh();
                                      }}
                                    >
                                      ➖
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>

                            <div className="mt-2 text-xs text-muted-foreground">
                              {r.signupCount}/{r.maxPlayers} {t('signups')}
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
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="border-b border-border bg-muted/20">
                <tr className="text-left">
                  <th className="px-3 py-2">{t('scheduledAt')}</th>
                  <th className="px-3 py-2">{t('raid')}</th>
                  <th className="px-3 py-2">{t('guild')}</th>
                  <th className="px-3 py-2">{t('status')}</th>
                  <th className="px-3 py-2">{t('myStatus')}</th>
                  <th className="px-3 py-2 text-right">{t('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {calendarRaidsSorted.map((r) => {
                  const status = myStatusIcon(r.status, r.mySignup);
                  const timeLabel = formatTime(locale, new Date(r.scheduledAtIso));
                  return (
                    <tr key={r.id} className="border-b border-border last:border-b-0 odd:bg-background even:bg-muted/10 hover:bg-muted/20">
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(new Date(r.scheduledAtIso))}{' '}
                        <span className="text-xs">{timeLabel}</span>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/${locale}/guild/${r.guildId}/raid/${r.id}`} className="text-primary hover:underline">
                          {r.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">{r.dungeonName}</div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.guildName}</td>
                      <td className="px-3 py-2 text-muted-foreground capitalize">{r.status}</td>
                      <td className="px-3 py-2">{status ? status : <span className="text-muted-foreground">{t('notSignedUp')}</span>}</td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/${locale}/guild/${r.guildId}/raid/${r.id}?mode=signup`}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-muted"
                          title={t('signupEdit')}
                          aria-label={t('signupEdit')}
                        >
                          ⚙️
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openNewRaidMenuPos
        ? createPortal(
            <div
              style={{ position: 'fixed', top: openNewRaidMenuPos.top, left: openNewRaidMenuPos.left, zIndex: 1000 }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="w-56 rounded-md border border-border bg-background shadow-md overflow-hidden">
                <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">{t('newRaid')}</div>
                {canCreateGuilds.map((g) => (
                  <Link
                    key={g.id}
                    href={`/${locale}/guild/${encodeURIComponent(g.id)}/raid/new`}
                    className="block px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => closeAllMenus()}
                  >
                    ➕ {t('createSingleRaid')} — {g.name}
                  </Link>
                ))}
                <div className="border-t border-border" />
                <button
                  type="button"
                  disabled
                  className="w-full text-left px-3 py-2 text-sm text-muted-foreground opacity-60 cursor-not-allowed"
                  title={t('createMultiRaidSoon')}
                >
                  ⏳ {t('createMultiRaid')}
                </button>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

