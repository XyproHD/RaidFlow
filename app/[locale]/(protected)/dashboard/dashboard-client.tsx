'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ClassIcon } from '@/components/class-icon';
import { SpecIcon } from '@/components/spec-icon';

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
  type: string;
};

export type DashboardCalendarRaid = {
  id: string;
  guildId: string;
  guildName: string;
  name: string;
  dungeonName: string;
  scheduledAtIso: string;
  status: string;
  signupCount: number;
  maxPlayers: number;
  hasNote: boolean;
  note: string | null;
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

function myStatusIcon(raidStatus: string, mySignup: DashboardCalendarRaid['mySignup']): '⌛' | '⚠️' | '✅' | '🪑' | null {
  if (!mySignup) return null;
  if (raidStatus !== 'locked') return '⌛';
  if (mySignup.leaderPlacement === 'substitute') return '🪑';
  if (mySignup.setConfirmed) return '✅';
  return '⚠️';
}

export function DashboardClient({
  guilds,
  characters,
  signups,
  calendarRaids,
}: {
  guilds: DashboardGuild[];
  characters: DashboardCharacter[];
  signups: DashboardSignupRow[];
  calendarRaids: DashboardCalendarRaid[];
}) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const router = useRouter();
  const [expandedNoteRaidId, setExpandedNoteRaidId] = useState<string | null>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const rangeStart = useMemo(() => addDays(today, -1), [today]);
  const rangeEnd = useMemo(() => addDays(today, 14), [today]);

  const days = useMemo(() => {
    const list: Date[] = [];
    for (let i = 0; i <= 15; i++) list.push(addDays(rangeStart, i));
    return list;
  }, [rangeStart]);

  const raidsByDay = useMemo(() => {
    const map = new Map<string, DashboardCalendarRaid[]>();
    for (const r of calendarRaids) {
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
  }, [calendarRaids]);

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
                  {g.armoryUrl ? (
                    <a
                      href={g.armoryUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-foreground hover:underline truncate"
                      title={g.name}
                    >
                      {g.name}
                    </a>
                  ) : (
                    <span className="font-semibold text-foreground truncate" title={g.name}>
                      {g.name}
                    </span>
                  )}
                  {g.realmLabel ? (
                    <span className="text-xs rounded bg-muted px-1.5 py-0.5 text-muted-foreground" title={g.realmLabel}>
                      {g.realmLabel}
                    </span>
                  ) : null}
                  <span className="text-xs rounded border border-border px-1.5 py-0.5 text-muted-foreground capitalize" title={g.role}>
                    {g.role}
                  </span>
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
            <table className="min-w-[780px] w-full text-sm">
              <thead className="border-b border-border bg-muted/20">
                <tr className="text-left">
                  <th className="px-3 py-2">{t('raid')}</th>
                  <th className="px-3 py-2">{t('dungeon')}</th>
                  <th className="px-3 py-2">{t('guild')}</th>
                  <th className="px-3 py-2">{t('scheduledAt')}</th>
                  <th className="px-3 py-2">{t('character')}</th>
                  <th className="px-3 py-2">{t('spec')}</th>
                </tr>
              </thead>
              <tbody>
                {signups.map((s) => (
                  <tr key={`${s.guildId}:${s.raidId}`} className="border-b border-border last:border-b-0">
                    <td className="px-3 py-2 font-medium">
                      <Link
                        href={`/${locale}/guild/${s.guildId}/raid/${s.raidId}`}
                        className="text-primary hover:underline"
                      >
                        {s.raidName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{s.dungeonName}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.guildName}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(s.scheduledAtIso))}
                    </td>
                    <td className="px-3 py-2">{s.signedCharacterName ?? '–'}</td>
                    <td className="px-3 py-2">{s.signedSpec ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="calendar-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id="calendar-heading" className="text-lg font-semibold text-foreground">
            {t('calendar')}
          </h2>
          <p className="text-xs text-muted-foreground">
            {new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(rangeStart)} –{' '}
            {new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(rangeEnd)}
          </p>
        </div>

        <div className="overflow-x-auto">
          <div className="grid grid-flow-col auto-cols-[minmax(240px,1fr)] gap-3 pb-1">
            {days.map((day) => {
              const key = startOfDay(day).toISOString();
              const raids = raidsByDay.get(key) ?? [];
              return (
                <div key={key} className="rounded-lg border border-border bg-card p-3">
                  <div className="flex items-center justify-between">
                    <div className="font-semibold text-foreground">{formatDayLabel(locale, day)}</div>
                    <div className="text-xs text-muted-foreground">{raids.length}</div>
                  </div>
                  <div className="mt-2 space-y-2">
                    {raids.length === 0 ? (
                      <div className="text-sm text-muted-foreground">{t('calendarEmptyDay')}</div>
                    ) : (
                      raids.map((r) => {
                        const status = myStatusIcon(r.status, r.mySignup);
                        const noteOpen = expandedNoteRaidId === r.id;
                        return (
                          <div key={r.id} className="rounded-md border border-border bg-background px-2 py-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Link
                                    href={`/${locale}/guild/${r.guildId}/raid/${r.id}`}
                                    className="font-semibold text-foreground hover:underline truncate"
                                    title={r.name}
                                  >
                                    {r.name}
                                  </Link>
                                  <span className="text-xs text-muted-foreground shrink-0">{formatTime(locale, new Date(r.scheduledAtIso))}</span>
                                </div>
                                <div className="text-xs text-muted-foreground truncate" title={`${r.dungeonName} • ${r.guildName}`}>
                                  {r.dungeonName} • {r.guildName}
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                                  <span className="capitalize">{r.status}</span>
                                  <span>
                                    {r.signupCount}/{r.maxPlayers} {t('signups')}
                                  </span>
                                </div>
                              </div>
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

                            {noteOpen ? (
                              <div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">
                                {r.note?.trim() ? r.note : t('noteHint')}
                              </div>
                            ) : null}

                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div className="text-sm">
                                {status ? <span title={t('myStatus')}>{status}</span> : <span className="text-muted-foreground">{t('notSignedUp')}</span>}
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
                                        await fetch(`/api/guilds/${encodeURIComponent(r.guildId)}/raids/${encodeURIComponent(r.id)}/signups`, { method: 'DELETE' });
                                        router.refresh();
                                      }}
                                    >
                                      ➖
                                    </button>
                                  </>
                                )}
                              </div>
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
      </section>
    </div>
  );
}

