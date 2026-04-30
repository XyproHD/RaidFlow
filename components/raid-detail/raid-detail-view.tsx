'use client';

import { createPortal } from 'react-dom';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { formatRaidTerminLine } from '@/lib/format-raid-termin';
import {
  buildSpecAttendanceByMinKeys,
} from '@/lib/min-spec-keys';
import {
  computeRoleAttendanceFromSignups,
  computeClassSignupTotals,
} from '@/lib/raid-overview-attendance';
import { ClassIcon } from '@/components/class-icon';
import { RoleIcon } from '@/components/role-icon';
import { CharacterMainStar } from '@/components/character-main-star';
import { CharacterGearscoreBadge } from '@/components/character-gearscore-badge';
import { BattlenetLogo } from '@/components/battlenet-logo';
import {
  CharacterNameWithDiscordInline,
  CharacterSpecIconsInline,
  CharacterSignupPunctualityMark,
} from '@/components/character-display-parts';
import { RaidAnmeldungen, type AnmeldungRow } from '@/components/raid-detail/raid-anmeldungen';
import { RaidSignupPlayerRow } from '@/components/raid-detail/raid-signup-player-row';
import { RaidSignupForm } from '@/components/raid-detail/raid-signup-form';
import {
  RaidOverviewSummaryRows,
  type RaidOverviewSummaryProps,
} from '@/components/raid-detail/raid-overview-summary';
import type { RaidSignupPhase, RaidSignupSelfSnapshot } from '@/lib/raid-detail-shared';
import { filterSignupsVisibleToViewer } from '@/lib/raid-detail-shared';
import { normalizeSignupPunctuality } from '@/lib/raid-signup-constants';
import { getSpecByDisplayName } from '@/lib/wow-tbc-classes';
import { roleFromSpecDisplayName } from '@/lib/spec-to-role';

export type AnnouncedLayoutProps = {
  groupMeta: {
    rosterOrder: string[];
    raidLeaderLabel: string | null;
    lootmasterLabel: string | null;
  }[];
  reserveOrder: string[];
};

export type RaidDetailRaid = {
  id: string;
  name: string;
  scheduledAt: string;
  scheduledEndAt: string | null;
  signupUntil: string;
  minTanks: number;
  minMelee: number;
  minRange: number;
  minHealers: number;
  minSpecs: unknown;
  maxPlayers: number;
  status: string;
  signupVisibility: string;
  note: string | null;
  _count: { signups: number };
  guild: { name: string };
  dungeon: { name: string; names: { name: string }[] };
  dungeonNames?: string[];
  raidGroupRestriction: { name: string } | null;
  signups: {
    id: string;
    userId: string;
    characterId?: string | null;
    type: string;
    isLate: boolean;
    punctuality?: string | null;
    note: string | null;
    signedSpec: string | null;
    leaderAllowsReserve: boolean;
    leaderMarkedTeilnehmer: boolean;
    onlySignedSpec: boolean;
    forbidReserve: boolean;
    leaderPlacement: string;
    setConfirmed: boolean;
    character: {
      name: string;
      mainSpec: string;
      offSpec: string | null;
      isMain: boolean;
      guildDiscordDisplayName?: string | null;
      gearScore?: number | null;
    } | null;
  }[];
};

export type RaidDetailCharacter = {
  id: string;
  name: string;
  mainSpec: string;
  offSpec: string | null;
  isMain: boolean;
  classId: string | null;
  gearScore: number | null;
  hasBattlenet: boolean;
  guildDiscordDisplayName?: string | null;
};

export type MySignupSerialized = RaidSignupSelfSnapshot;

function myStatusIcon(
  raidStatus: string,
  mySignups: MySignupSerialized[]
): '⌛' | '⚠️' | '✅' | '🪑' | null {
  if (!mySignups.length) return null;
  if (raidStatus !== 'locked' && raidStatus !== 'announced') return '⌛';
  if (mySignups.some((s) => s.setConfirmed)) return '✅';
  if (mySignups.some((s) => s.leaderPlacement === 'substitute')) return '🪑';
  return '⚠️';
}

function signupTypeNorm(v: string) {
  return v === 'main' ? 'normal' : v;
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

function raidSignupToAnmeldungRow(s: RaidDetailRaid['signups'][number]): AnmeldungRow {
  return {
    id: s.id,
    userId: s.userId,
    punctuality: s.punctuality,
    character: s.character
      ? {
          ...s.character,
          gearScore: s.character.gearScore ?? null,
        }
      : null,
    signedSpec: s.signedSpec,
    type: s.type,
    isLate: s.isLate,
    note: s.note,
    leaderAllowsReserve: s.leaderAllowsReserve,
    leaderMarkedTeilnehmer: s.leaderMarkedTeilnehmer,
    onlySignedSpec: s.onlySignedSpec,
    forbidReserve: s.forbidReserve,
  };
}

function openMenuAtButton(btn: HTMLButtonElement) {
  const r = btn.getBoundingClientRect();
  const width = 200;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, r.right - width));
  const top = Math.min(window.innerHeight - 8, r.bottom + 6);
  return { top, left };
}

const ROLE_KEYS = ['Tank', 'Melee', 'Range', 'Healer'] as const;

function signupTypeOpenLabel(
  t: ReturnType<typeof useTranslations>,
  type: string
): string {
  const n = type === 'main' ? 'normal' : type;
  if (n === 'normal') return t('signupType_verfugbar');
  if (n === 'uncertain') return t('signupType_uncertain');
  if (n === 'reserve') return t('signupType_reserve');
  if (n === 'declined') return t('signupType_declined');
  return t('signupType_verfugbar');
}

function raidStatusLabel(t: ReturnType<typeof useTranslations>, status: string): string {
  if (status === 'open') return t('raidStatus_open');
  if (status === 'announced') return t('raidStatus_announced');
  if (status === 'locked') return t('raidStatus_locked');
  if (status === 'cancelled') return t('raidStatus_cancelled');
  return status;
}

export function RaidDetailView({
  locale,
  guildId,
  raidId,
  userId,
  raid,
  dungeonLabel,
  organizerLabel,
  canEdit,
  canEditRaid,
  canSignup,
  signupPhase,
  characters,
  mySignups,
  initialSignupOpen,
  announcedLayout,
}: {
  locale: string;
  guildId: string;
  raidId: string;
  userId: string;
  raid: RaidDetailRaid;
  /** Zeile „Dungeons“ im Kopfblock (wie Planer) */
  dungeonLabel: string;
  /** Anzeige-Name des Organisators; null = nicht gesetzt / nicht auflösbar */
  organizerLabel: string | null;
  canEdit: boolean;
  canEditRaid: boolean;
  canSignup: boolean;
  signupPhase: RaidSignupPhase;
  characters: RaidDetailCharacter[];
  mySignups: MySignupSerialized[];
  initialSignupOpen: boolean;
  announcedLayout: AnnouncedLayoutProps | null;
}) {
  const t = useTranslations('raidDetail');
  const tRoster = useTranslations('raidRosterPlanner');
  const tDash = useTranslations('dashboard');
  const tEdit = useTranslations('raidEdit');
  const tProfile = useTranslations('profile');
  const router = useRouter();
  const intlLocale = useLocale();

  const [leaderMenuOpen, setLeaderMenuOpen] = useState(false);
  const [leaderMenuPos, setLeaderMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [mySignupRowMenu, setMySignupRowMenu] = useState<{
    signupId: string;
    top: number;
    left: number;
  } | null>(null);
  const [showSignup, setShowSignup] = useState(initialSignupOpen);
  const [myNoteExpandedId, setMyNoteExpandedId] = useState<string | null>(null);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [withdrawTargetCharacterId, setWithdrawTargetCharacterId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLeaderMenuOpen(false);
        setLeaderMenuPos(null);
        setMySignupRowMenu(null);
        setMyNoteExpandedId(null);
        setWithdrawDialogOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const scheduledAt = useMemo(() => new Date(raid.scheduledAt), [raid.scheduledAt]);
  const scheduledEndAt = raid.scheduledEndAt ? new Date(raid.scheduledEndAt) : null;
  const signupUntil = useMemo(() => new Date(raid.signupUntil), [raid.signupUntil]);

  const raidTermin = formatRaidTerminLine(intlLocale, scheduledAt, scheduledEndAt);

  const minSpecsObj =
    raid.minSpecs && typeof raid.minSpecs === 'object' && !Array.isArray(raid.minSpecs)
      ? (raid.minSpecs as Record<string, number>)
      : null;

  const visibleSignups = filterSignupsVisibleToViewer(
    raid.signups,
    userId,
    raid.signupVisibility,
    canEdit,
    raid.status
  );

  const signupById = useMemo(() => new Map(raid.signups.map((s) => [s.id, s])), [raid.signups]);

  const rows: AnmeldungRow[] = visibleSignups
    .filter((s) => signupTypeNorm(s.type) !== 'declined')
    .map(raidSignupToAnmeldungRow);
  const absagenRows: AnmeldungRow[] = visibleSignups
    .filter((s) => signupTypeNorm(s.type) === 'declined')
    .map(raidSignupToAnmeldungRow);

  const visibilityLabel =
    raid.signupVisibility === 'raid_leader_only' ? t('visibilityLeaders') : t('visibilityPublic');

  const roleMinByKey: Record<(typeof ROLE_KEYS)[number], number> = {
    Tank: raid.minTanks,
    Melee: raid.minMelee,
    Range: raid.minRange,
    Healer: raid.minHealers,
  };

  const overviewSummaryProps: RaidOverviewSummaryProps = useMemo(() => {
    const roleAttendance = computeRoleAttendanceFromSignups(raid.signups);
    const classSignupTotals = computeClassSignupTotals(raid.signups);
    const specAttendanceByKey = buildSpecAttendanceByMinKeys(
      raid.signups.map((s) => ({
        type: s.type,
        signedSpec: s.signedSpec,
        character: s.character ? { mainSpec: s.character.mainSpec } : null,
        punctuality: s.punctuality,
        isLate: s.isLate,
      })),
      minSpecsObj
    );
    return {
      roleAttendance,
      classSignupTotals,
      roleMinByKey,
      minSpecsObj,
      specAttendanceByKey,
    };
  }, [
    raid.signups,
    minSpecsObj,
    raid.minTanks,
    raid.minMelee,
    raid.minRange,
    raid.minHealers,
  ]);

  const signupState = signupIndicator(raid.signupUntil, raid.status);
  const myActiveSignups = useMemo(
    () => mySignups.filter((s) => signupTypeNorm(s.type) !== 'declined'),
    [mySignups]
  );
  const statusIcon = myStatusIcon(raid.status, myActiveSignups);
  const hasMyActiveSignup = myActiveSignups.length > 0;

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

  const WITHDRAW_REASON_MIN = 10;

  async function runWithdrawDelete(opts?: { withdrawReason?: string; characterId?: string | null }) {
    setWithdrawBusy(true);
    try {
      const payload: { withdrawReason?: string; characterId?: string } = {};
      if (opts?.withdrawReason && opts.withdrawReason.trim().length >= WITHDRAW_REASON_MIN) {
        payload.withdrawReason = opts.withdrawReason.trim();
      }
      const cid = opts?.characterId?.trim();
      if (cid) payload.characterId = cid;

      const optsFetch: RequestInit = { method: 'DELETE' };
      if (Object.keys(payload).length > 0) {
        optsFetch.headers = { 'Content-Type': 'application/json' };
        optsFetch.body = JSON.stringify(payload);
      }
      const res = await fetch(
        `/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}/signups`,
        optsFetch
      );
      if (!res.ok) return;
      setMySignupRowMenu(null);
      router.refresh();
    } finally {
      setWithdrawBusy(false);
    }
  }

  async function beginWithdrawForSignup(signup: MySignupSerialized) {
    setWithdrawTargetCharacterId(signup.characterId ?? null);
    if (raid.status === 'announced' && signup.setConfirmed) {
      setWithdrawReason('');
      setWithdrawDialogOpen(true);
      setMySignupRowMenu(null);
      return;
    }
    if (!window.confirm(t('withdrawConfirm'))) {
      setWithdrawTargetCharacterId(null);
      return;
    }
    await runWithdrawDelete({ characterId: signup.characterId });
  }

  async function submitWithdrawWithReason() {
    const r = withdrawReason.trim();
    if (r.length < WITHDRAW_REASON_MIN) return;
    setWithdrawDialogOpen(false);
    await runWithdrawDelete({ withdrawReason: r, characterId: withdrawTargetCharacterId });
    setWithdrawReason('');
    setWithdrawTargetCharacterId(null);
  }

  return (
    <div className="space-y-8">
      <header className="rounded-xl border border-border bg-card/40 shadow-sm overflow-hidden">
        <div className={cn('relative px-4 py-3 sm:px-5 sm:py-4', canEdit && 'pr-14 sm:pr-16')}>
          {canEdit ? (
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
          ) : null}
          <div className="min-w-0 space-y-1.5 pr-1">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{raid.name}</h1>
            <p className="text-sm text-foreground/90">{dungeonLabel}</p>
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

      <section className="rounded-xl border border-border bg-card/40 shadow-sm overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <h2 className="text-sm font-semibold text-foreground shrink-0">
            {t('sectionOverview')}
          </h2>
          <RaidOverviewSummaryRows {...overviewSummaryProps} />
        </div>

        <div className="p-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-4 rounded-lg border border-border/60 bg-background/50 px-3 py-2">
              <dt className="text-muted-foreground shrink-0">{tDash('signupOpenUntil')}</dt>
              <dd className="flex items-center gap-2 text-right min-w-0">
                <span className="shrink-0" title={tDash('signupOpenUntil')}>
                  {signupState.icon}
                </span>
                <span>
                  {new Intl.DateTimeFormat(intlLocale, {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(signupUntil)}
                </span>
              </dd>
            </div>
            <div className="flex justify-between gap-4 rounded-lg border border-border/60 bg-background/50 px-3 py-2">
              <dt className="text-muted-foreground">{t('maxPlayers')}</dt>
              <dd>
                {raid._count.signups} / {raid.maxPlayers}
              </dd>
            </div>
            <div className="flex justify-between gap-4 rounded-lg border border-border/60 bg-background/50 px-3 py-2">
              <dt className="text-muted-foreground">{t('status')}</dt>
              <dd>{raidStatusLabel(t, raid.status)}</dd>
            </div>
            <div className="flex justify-between gap-4 rounded-lg border border-border/60 bg-background/50 px-3 py-2">
              <dt className="text-muted-foreground">{t('visibility')}</dt>
              <dd>{visibilityLabel}</dd>
            </div>
            {raid.raidGroupRestriction ? (
              <div className="flex justify-between gap-4 rounded-lg border border-border/60 bg-background/50 px-3 py-2 sm:col-span-2">
                <dt className="text-muted-foreground">{t('restriction')}</dt>
                <dd className="text-right">{raid.raidGroupRestriction.name}</dd>
              </div>
            ) : null}
          </dl>

          {raid.note ? (
            <aside className="mt-5 rounded-xl border-2 border-primary/25 bg-primary/[0.06] dark:bg-primary/10 px-4 py-3 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-widest text-primary mb-2 flex items-center gap-2">
                <span aria-hidden>📌</span>
                {t('note')}
              </h3>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{raid.note}</p>
            </aside>
          ) : null}
        </div>
      </section>

      {raid.status === 'announced' && announcedLayout ? (
        <section className="rounded-xl border border-border bg-card/40 shadow-sm overflow-hidden">
          <div className="border-b border-border bg-muted/20 px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">{t('sectionPublishedRoster')}</h2>
          </div>
          <div className="p-4 space-y-6">
            {announcedLayout.groupMeta.map((meta, gi) => (
              <div key={`g-${gi}`} className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">
                  {t('publishedGroupTitle', { n: gi + 1 })}
                </h3>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {meta.raidLeaderLabel ? (
                    <p>
                      {t('raidLeaderShort')}: <span className="text-foreground">{meta.raidLeaderLabel}</span>
                    </p>
                  ) : null}
                  {meta.lootmasterLabel ? (
                    <p>
                      {t('lootmasterShort')}: <span className="text-foreground">{meta.lootmasterLabel}</span>
                    </p>
                  ) : null}
                </div>
                {meta.rosterOrder.length === 0 ? (
                  <p className="text-sm text-muted-foreground">—</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {meta.rosterOrder.map((sid) => {
                      const s = signupById.get(sid);
                      if (!s) {
                        return (
                          <li key={sid} className="text-sm text-muted-foreground">
                            {t('signupAnonymous')}
                          </li>
                        );
                      }
                      return (
                        <li key={sid} className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
                          <RaidSignupPlayerRow
                            row={raidSignupToAnmeldungRow(s)}
                            canEdit={false}
                            showTypeLabel={false}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ))}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">{t('publishedReserveHeading')}</h3>
              {announcedLayout.reserveOrder.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {announcedLayout.reserveOrder.map((sid) => {
                    const s = signupById.get(sid);
                    if (!s) {
                      return (
                        <li key={sid} className="text-sm text-muted-foreground">
                          {t('signupAnonymous')}
                        </li>
                      );
                    }
                    return (
                      <li key={sid} className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
                        <RaidSignupPlayerRow
                          row={raidSignupToAnmeldungRow(s)}
                          canEdit={false}
                          showTypeLabel
                        />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {raid.signups.some((s) => (s.type === 'main' ? 'normal' : s.type) === 'declined') ? (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">{t('publishedDeclinedHeading')}</h3>
                <ul className="flex flex-col gap-2">
                  {raid.signups
                    .filter((s) => (s.type === 'main' ? 'normal' : s.type) === 'declined')
                    .map((s) => (
                      <li key={s.id} className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
                        <RaidSignupPlayerRow
                          row={raidSignupToAnmeldungRow(s)}
                          canEdit={false}
                          showTypeLabel
                        />
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-card/40 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">{t('mySignupSection')}</h2>
          {canSignup && (raid.status === 'open' || raid.status === 'announced') ? (
            <button
              type="button"
              onClick={() => setShowSignup(true)}
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline shrink-0 transition-colors"
            >
              {hasMyActiveSignup ? t('signupLinkAnother') : t('signupLinkRegister')}
            </button>
          ) : null}
        </div>
        <div className="p-4 space-y-3">
          {hasMyActiveSignup ? (
            <div className="overflow-x-auto -mx-1">
              <table className="min-w-[560px] w-full text-sm">
                <tbody>
                  {[...myActiveSignups]
                    .sort((a, b) => {
                      const ca = characters.find((c) => c.id === a.characterId)?.name ?? '';
                      const cb = characters.find((c) => c.id === b.characterId)?.name ?? '';
                      return ca.localeCompare(cb);
                    })
                    .map((signup, idx) => {
                      const myChar = signup.characterId
                        ? characters.find((c) => c.id === signup.characterId)
                        : null;
                      const myDiscord = myChar?.guildDiscordDisplayName?.trim();
                      const specForIcon = signup.signedSpec ?? myChar?.mainSpec ?? null;
                      const role = roleFromSpecDisplayName(specForIcon?.trim() || null);
                      const derivedClassId = specForIcon
                        ? getSpecByDisplayName(specForIcon)?.classId ?? null
                        : null;
                      const punct = normalizeSignupPunctuality(signup.punctuality, signup.isLate);
                      const punctLabel =
                        punct === 'on_time'
                          ? t('punctualityOnTime')
                          : punct === 'tight'
                            ? t('punctualityTight')
                            : t('punctualityLate');
                      const showRowMenu = raid.status === 'open' || raid.status === 'announced';
                      const noteLine = signup.note?.trim() ?? '';
                      const hasNote = noteLine.length > 0;

                      return (
                        <Fragment key={signup.id}>
                          <tr className="border-b border-border hover:bg-muted/15 transition-colors">
                            <td className="px-3 py-2.5 align-middle">
                              <div className="inline-flex flex-wrap items-center gap-2 min-w-0">
                                {role ? <RoleIcon role={role} size={18} /> : null}
                                <span className="inline-flex items-center gap-1 shrink-0">
                                  {derivedClassId ? (
                                    <ClassIcon classId={derivedClassId} size={22} title={specForIcon ?? undefined} />
                                  ) : null}
                                  {specForIcon ? (
                                    <CharacterSpecIconsInline
                                      mainSpec={specForIcon}
                                      offSpec={myChar?.offSpec ?? null}
                                      size={20}
                                      slashClassName="hidden"
                                      offSpecWrapperClassName="grayscale contrast-90 inline-flex"
                                      offSpecIconClassName="opacity-90"
                                    />
                                  ) : null}
                                </span>
                                {myChar ? (
                                  <CharacterMainStar
                                    isMain={!!myChar.isMain}
                                    titleMain={tProfile('mainLabel')}
                                    titleAlt={tProfile('altLabel')}
                                    sizePx={16}
                                  />
                                ) : null}
                                {myChar ? (
                                  <CharacterNameWithDiscordInline
                                    name={myChar.name}
                                    discordName={myDiscord}
                                    className="font-medium text-foreground truncate"
                                  />
                                ) : (
                                  <span className="text-muted-foreground">{t('signupAnonymous')}</span>
                                )}
                                {myChar?.hasBattlenet ? (
                                  <BattlenetLogo size={18} title={tProfile('bnetLinkedBadgeTitle')} />
                                ) : null}
                                {myChar ? (
                                  <CharacterGearscoreBadge
                                    characterId={myChar.id}
                                    hasBattlenet={myChar.hasBattlenet}
                                    gearScore={myChar.gearScore}
                                  />
                                ) : null}
                                <CharacterSignupPunctualityMark kind={punct} label={punctLabel} />
                                {hasNote ? (
                                  <button
                                    type="button"
                                    className="shrink-0 text-base leading-none opacity-80 hover:opacity-100"
                                    aria-label={tDash('toggleNote')}
                                    title={tDash('toggleNote')}
                                    onClick={() =>
                                      setMyNoteExpandedId((id) => (id === signup.id ? null : signup.id))
                                    }
                                  >
                                    📒
                                  </button>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 align-middle w-[min(14rem,28%)]">
                              <div className="flex flex-wrap items-center gap-2">
                                {idx === 0 && statusIcon ? (
                                  <span className="text-base shrink-0" title={tDash('myStatus')}>
                                    {statusIcon}
                                  </span>
                                ) : null}
                                <span className="text-sm text-foreground">
                                  {raid.status === 'locked' || raid.status === 'announced' ? (
                                    signup.leaderPlacement === 'substitute' ? (
                                      t('mySignupLockedSubstitute')
                                    ) : signup.setConfirmed ? (
                                      t('mySignupLockedConfirmed')
                                    ) : (
                                      t('mySignupLockedPending')
                                    )
                                  ) : (
                                    signupTypeOpenLabel(t, signup.type)
                                  )}
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 align-middle text-right w-12">
                              {showRowMenu ? (
                                <button
                                  type="button"
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted transition-colors text-muted-foreground"
                                  aria-label={tDash('actions')}
                                  title={tDash('actions')}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const pos = openMenuAtButton(e.currentTarget);
                                    setMySignupRowMenu((cur) =>
                                      cur?.signupId === signup.id ? null : { signupId: signup.id, ...pos }
                                    );
                                  }}
                                >
                                  ⋮
                                </button>
                              ) : null}
                            </td>
                          </tr>
                          {myNoteExpandedId === signup.id && hasNote ? (
                            <tr className="border-b border-border bg-muted/25 last:border-b-0">
                              <td
                                colSpan={3}
                                className="px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap"
                              >
                                {noteLine}
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{tDash('notSignedUp')}</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card/40 shadow-sm overflow-hidden">
        <div className="border-b border-border bg-muted/20 px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">{t('anmeldungenHeading')}</h2>
        </div>
        <div className="p-4 space-y-2">
          {raid.signupVisibility === 'raid_leader_only' && !canEdit ? (
            <p className="text-xs text-muted-foreground">{t('signupListHidden')}</p>
          ) : null}
          <RaidAnmeldungen rows={rows} canEdit={canEdit} />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card/40 shadow-sm overflow-hidden">
        <div className="border-b border-border bg-muted/20 px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">{t('sectionAbsagen')}</h2>
        </div>
        <div className="p-4 space-y-2">
          {raid.signupVisibility === 'raid_leader_only' && !canEdit ? (
            <p className="text-xs text-muted-foreground">{t('signupListHidden')}</p>
          ) : null}
          <RaidAnmeldungen rows={absagenRows} canEdit={canEdit} />
        </div>
      </section>

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
                    router.push(`/${locale}/guild/${guildId}/raid/${raidId}/plan`);
                  }}
                >
                  📅 {t('menuPlan')}
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
                {raid.status === 'open' || raid.status === 'announced' ? (
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
                ) : null}
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

      {mySignupRowMenu
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-[995] bg-black/20"
                onMouseDown={() => setMySignupRowMenu(null)}
              />
              <div
                className="fixed z-[1000] w-48 rounded-md border border-border bg-background shadow-lg overflow-hidden"
                style={{ top: mySignupRowMenu.top, left: mySignupRowMenu.left }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {(() => {
                  const menuSignup = mySignups.find((s) => s.id === mySignupRowMenu.signupId);
                  if (!menuSignup) return null;
                  return (
                    <>
                      {raid.status === 'open' || raid.status === 'announced' ? (
                        <button
                          type="button"
                          className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted"
                          onClick={() => {
                            setMySignupRowMenu(null);
                            setShowSignup(true);
                          }}
                        >
                          ⚙️ {t('signupEditMenu')}
                        </button>
                      ) : null}
                      {raid.status === 'open' || raid.status === 'announced' ? (
                        <button
                          type="button"
                          disabled={withdrawBusy}
                          className="w-full text-left px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          onClick={() => void beginWithdrawForSignup(menuSignup)}
                        >
                          ➖ {t('withdraw')}
                        </button>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            </>,
            document.body
          )
        : null}

      {showSignup && canSignup
        ? createPortal(
            <div
              className="fixed inset-0 z-[1005] flex items-start justify-center overflow-y-auto bg-black/50 p-4"
              role="presentation"
              onClick={() => setShowSignup(false)}
            >
              <div
                className="relative my-4 w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-background shadow-xl"
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-background px-4 py-3">
                  <h2 className="text-lg font-semibold">{t('sectionSignup')}</h2>
                  <button
                    type="button"
                    className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                    onClick={() => setShowSignup(false)}
                  >
                    {tEdit('abort')}
                  </button>
                </div>
                <div className="max-h-[calc(100vh-8rem)] overflow-y-auto rounded-b-xl p-4">
                  <RaidSignupForm
                    guildId={guildId}
                    raidId={raidId}
                    characters={characters}
                    signupPhase={signupPhase}
                    mySignups={mySignups}
                    onSaved={() => setShowSignup(false)}
                  />
                </div>
              </div>
            </div>,
            document.body
          )
        : null}

      {withdrawDialogOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[1005] flex items-start justify-center overflow-y-auto bg-black/50 p-4"
              role="presentation"
              onClick={() => {
                setWithdrawDialogOpen(false);
                setWithdrawTargetCharacterId(null);
              }}
            >
              <div
                className="relative my-4 w-full max-w-lg overflow-hidden rounded-xl border border-border bg-background shadow-xl"
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="border-b border-border bg-background px-4 py-3">
                  <h2 className="text-lg font-semibold">{t('withdrawReasonTitle')}</h2>
                  <p className="text-sm text-muted-foreground mt-1">{t('withdrawReasonHint')}</p>
                </div>
                <div className="p-4 space-y-3">
                  <textarea
                    value={withdrawReason}
                    onChange={(e) => setWithdrawReason(e.target.value)}
                    rows={4}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    placeholder={t('withdrawReasonPlaceholder')}
                  />
                  <p className="text-xs text-muted-foreground">{t('withdrawReasonMin', { n: WITHDRAW_REASON_MIN })}</p>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                      onClick={() => {
                        setWithdrawDialogOpen(false);
                        setWithdrawTargetCharacterId(null);
                      }}
                    >
                      {t('withdrawReasonCancel')}
                    </button>
                    <button
                      type="button"
                      disabled={withdrawBusy || withdrawReason.trim().length < WITHDRAW_REASON_MIN}
                      className="rounded-md bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                      onClick={() => void submitWithdrawWithReason()}
                    >
                      {t('withdrawReasonSubmit')}
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
