'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { ClassIcon } from '@/components/class-icon';
import { SpecIcon } from '@/components/spec-icon';
import { ScheduleXCalendar, useCalendarApp } from '@schedule-x/react';
import { createViewWeek } from '@schedule-x/calendar';
import 'temporal-polyfill/global';
import { getSpecByDisplayName } from '@/lib/wow-tbc-classes';

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
  raidStatus: string;
  leaderPlacement: string;
  setConfirmed: boolean;
  characterMainSpec: string | null;
  characterOffSpec: string | null;
  characterHasBattlenet: boolean;
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
  canCreateGuildIds,
}: {
  guilds: DashboardGuild[];
  characters: DashboardCharacter[];
  signups: DashboardSignupRow[];
  calendarRaids: DashboardCalendarRaid[];
  canCreateGuildIds: string[];
}) {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const router = useRouter();
  const [expandedNoteRaidId, setExpandedNoteRaidId] = useState<string | null>(null);
  const [openSignupMenuKey, setOpenSignupMenuKey] = useState<string | null>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const rangeStart = useMemo(() => addDays(today, -1), [today]);
  const rangeEnd = useMemo(() => addDays(today, 14), [today]);
  const defaultCreateGuildId = canCreateGuildIds[0] ?? null;

  // FullCalendar uses `calendarRaids` directly as events.

  const raidsById = useMemo(() => new Map(calendarRaids.map((r) => [r.id, r])), [calendarRaids]);

  const sxEvents = useMemo(() => {
    // Schedule-X requires Temporal.PlainDate or Temporal.ZonedDateTime.
    // We convert our UTC ISO string into a ZonedDateTime in the viewer's timezone.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return calendarRaids.map((r) => {
      const instant = Temporal.Instant.from(r.scheduledAtIso);
      const start = instant.toZonedDateTimeISO(tz);
      // We don't store end-time yet; render with a small default duration.
      const end = start.add({ hours: 3 });
      return {
        id: r.id,
        title: r.name,
        start,
        end,
      };
    });
  }, [calendarRaids]);

  const calendarApp = useCalendarApp({
    views: [createViewWeek()],
    defaultView: createViewWeek().name,
    selectedDate: Temporal.PlainDate.from(new Date(rangeStart).toISOString().slice(0, 10)),
    weekOptions: {
      nDays: 16,
      gridStep: 30,
    },
    minDate: Temporal.PlainDate.from(new Date(rangeStart).toISOString().slice(0, 10)),
    maxDate: Temporal.PlainDate.from(new Date(rangeEnd).toISOString().slice(0, 10)),
    firstDayOfWeek: 1,
    events: sxEvents as any,
    isResponsive: true,
  });

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
            <table className="min-w-[980px] w-full text-sm">
              <thead className="border-b border-border bg-muted/20">
                <tr className="text-left">
                  <th className="px-3 py-2">{t('scheduledAt')}</th>
                  <th className="px-3 py-2">{t('status')}</th>
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
                  const menuOpen = openSignupMenuKey === key;

                  return (
                    <tr key={key} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2 align-top">
                        <div className="text-muted-foreground">
                          {new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(s.scheduledAtIso))}
                        </div>
                        <div className="font-medium">
                          <Link
                            href={`/${locale}/guild/${s.guildId}/raid/${s.raidId}`}
                            className="text-primary hover:underline"
                          >
                            {s.raidName}
                          </Link>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {s.dungeonName} • {s.guildName}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground align-top">
                        <span className="capitalize">{s.raidStatus}</span>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <button
                          type="button"
                          className="grid items-center gap-2 rounded-md border border-border bg-background px-2 py-2 hover:bg-muted min-w-0"
                          style={{ gridTemplateColumns: '28px 1fr' }}
                          onClick={() => router.push(`/${locale}/guild/${s.guildId}/raid/${s.raidId}?mode=signup`)}
                          title={t('signupEdit')}
                        >
                          <div className="flex shrink-0 items-center justify-center w-7 h-7">
                            {derivedClassId ? <ClassIcon classId={derivedClassId} size={24} title={specForIcon ?? undefined} /> : null}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="flex items-center gap-1 shrink-0">
                                {specForIcon ? <SpecIcon spec={specForIcon} size={22} /> : null}
                                {s.characterOffSpec ? (
                                  <span className="grayscale contrast-90 inline-flex">
                                    <SpecIcon spec={s.characterOffSpec} size={22} className="opacity-90" />
                                  </span>
                                ) : null}
                              </div>
                              {s.characterHasBattlenet ? (
                                <span
                                  className="shrink-0 rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                                  title={t('bnetLinkedBadgeTitle')}
                                >
                                  {t('bnetLinkedBadge')}
                                </span>
                              ) : null}
                            </div>
                            <div className="font-medium text-foreground truncate">{s.signedCharacterName ?? '–'}</div>
                            <div className="text-xs text-muted-foreground truncate">{s.guildName}</div>
                          </div>
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
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-muted"
                            aria-label={t('actions')}
                            title={t('actions')}
                            onClick={() => setOpenSignupMenuKey(menuOpen ? null : key)}
                          >
                            ☰
                          </button>
                          {menuOpen ? (
                            <div className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-border bg-background shadow-md">
                              <Link
                                href={`/${locale}/guild/${s.guildId}/raid/${s.raidId}?mode=signup`}
                                className="block px-3 py-2 text-sm hover:bg-muted"
                                onClick={() => setOpenSignupMenuKey(null)}
                              >
                                ⚙️ {t('signupEdit')}
                              </Link>
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-muted text-destructive"
                                onClick={async () => {
                                  await fetch(
                                    `/api/guilds/${encodeURIComponent(s.guildId)}/raids/${encodeURIComponent(s.raidId)}/signups`,
                                    { method: 'DELETE' }
                                  );
                                  setOpenSignupMenuKey(null);
                                  router.refresh();
                                }}
                              >
                                ➖ {t('signupWithdraw')}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="text-xs text-muted-foreground">
              {new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(rangeStart)} –{' '}
              {new Intl.DateTimeFormat(locale, { dateStyle: 'short' }).format(rangeEnd)}
            </p>
            {defaultCreateGuildId ? (
              <>
                <Link
                  href={`/${locale}/guild/${encodeURIComponent(defaultCreateGuildId)}/raid/new`}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  {t('createSingleRaid')}
                </Link>
                <button
                  type="button"
                  disabled
                  className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground opacity-60 cursor-not-allowed"
                  title={t('createMultiRaidSoon')}
                >
                  {t('createMultiRaid')}
                </button>
              </>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-3">
          <div className="sx-react-calendar-wrapper">
            <ScheduleXCalendar
              calendarApp={calendarApp}
              customComponents={{
                timeGridEvent: ({ calendarEvent }: { calendarEvent: any }) => {
                  const r = raidsById.get(String(calendarEvent.id));
                  if (!r) return null;
                  const status = myStatusIcon(r.status, r.mySignup);
                  const noteOpen = expandedNoteRaidId === r.id;
                  const timeLabel = formatTime(locale, new Date(r.scheduledAtIso));
                  return (
                    <div className="rounded-md border border-border bg-background px-2 py-2">
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
                            <span className="text-xs text-muted-foreground shrink-0">{timeLabel}</span>
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
                    </div>
                  );
                },
              }}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

