'use client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { formatRaidTerminLine } from '@/lib/format-raid-termin';
import { buildSpecStatsByMinKeys } from '@/lib/min-spec-keys';
import { ClassIcon } from '@/components/class-icon';
import { RoleIcon } from '@/components/role-icon';
import { CharacterMainStar } from '@/components/character-main-star';
import { CharacterGearscoreBadge } from '@/components/character-gearscore-badge';
import { BattlenetLogo } from '@/components/battlenet-logo';
import { CharacterNameWithDiscordInline } from '@/components/character-display-parts';
import { RaidAnmeldungen, type AnmeldungRow } from '@/components/raid-detail/raid-anmeldungen';
import { RaidSignupPlayerRow } from '@/components/raid-detail/raid-signup-player-row';
import { SignupSpecIcons } from '@/components/raid-detail/signup-spec-icons';
import { RaidSignupForm } from '@/components/raid-detail/raid-signup-form';
import { RaidOverviewSummaryRows } from '@/components/raid-detail/raid-overview-summary';
import type { RaidSignupPhase, RaidSignupSelfSnapshot } from '@/lib/raid-detail-shared';
import { filterSignupsVisibleToViewer } from '@/lib/raid-detail-shared';

export type AnnouncedLayoutProps = {
  groupMeta: {
    rosterOrder: string[];
    raidLeaderLabel: string | null;
    lootmasterLabel: string | null;
  }[];
  reserveOrder: string[];
};

type RoleStat = { normal: number; uncertain: number; reserve: number };

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
    punctuality: string;
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
    character: s.character,
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
  roleStats,
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
  roleStats: Record<(typeof ROLE_KEYS)[number], RoleStat>;
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
  const tDash = useTranslations('dashboard');
  const tEdit = useTranslations('raidEdit');
  const tProfile = useTranslations('profile');
  const router = useRouter();
  const intlLocale = useLocale();

  const [leaderMenuOpen, setLeaderMenuOpen] = useState(false);
  const [leaderMenuPos, setLeaderMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [myMenuOpen, setMyMenuOpen] = useState(false);
  const [myMenuPos, setMyMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [showSignup, setShowSignup] = useState(initialSignupOpen);
  const [expandedNote, setExpandedNote] = useState(false);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setLeaderMenuOpen(false);
        setLeaderMenuPos(null);
        setMyMenuOpen(false);
        setMyMenuPos(null);
        setWithdrawDialogOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const scheduledAt = useMemo(() => new Date(raid.scheduledAt), [raid.scheduledAt]);
  const scheduledEndAt = raid.scheduledEndAt ? new Date(raid.scheduledEndAt) : null;
  const signupUntil = useMemo(() => new Date(raid.signupUntil), [raid.signupUntil]);

  const dungeonName =
    raid.dungeonNames && raid.dungeonNames.length > 0
      ? raid.dungeonNames.join(' / ')
      : raid.dungeon.names[0]?.name ?? raid.dungeon.name;
  const dateShort = new Intl.DateTimeFormat(intlLocale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(scheduledAt);

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

  const rows: AnmeldungRow[] = visibleSignups.map((s) => ({
    id: s.id,
    userId: s.userId,
    character: s.character,
    signedSpec: s.signedSpec,
    type: s.type,
    isLate: s.isLate,
    note: s.note,
    leaderAllowsReserve: s.leaderAllowsReserve,
    leaderMarkedTeilnehmer: s.leaderMarkedTeilnehmer,
    onlySignedSpec: s.onlySignedSpec,
    forbidReserve: s.forbidReserve,
  }));

  const visibilityLabel =
    raid.signupVisibility === 'raid_leader_only' ? t('visibilityLeaders') : t('visibilityPublic');

  const roleMinByKey: Record<(typeof ROLE_KEYS)[number], number> = {
    Tank: raid.minTanks,
    Melee: raid.minMelee,
    Range: raid.minRange,
    Healer: raid.minHealers,
  };

  const specCountsByType = useMemo(
    () =>
      buildSpecStatsByMinKeys(
        raid.signups.map((s) => ({
          type: s.type,
          signedSpec: s.signedSpec,
          character: s.character ? { mainSpec: s.character.mainSpec } : null,
        })),
        minSpecsObj
      ),
    [raid.signups, minSpecsObj]
  );

  const signupState = signupIndicator(raid.signupUntil, raid.status);
  const statusIcon = myStatusIcon(raid.status, mySignups);
  const hasMySignup = mySignups.length > 0;

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

  async function runWithdrawDelete(withdrawReasonPayload?: string) {
    setWithdrawBusy(true);
    try {
      const opts: RequestInit = { method: 'DELETE' };
      if (withdrawReasonPayload && withdrawReasonPayload.trim().length >= WITHDRAW_REASON_MIN) {
        opts.headers = { 'Content-Type': 'application/json' };
        opts.body = JSON.stringify({ withdrawReason: withdrawReasonPayload.trim() });
      }
      const res = await fetch(
        `/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}/signups`,
        opts
      );
      if (!res.ok) return;
      setMyMenuOpen(false);
      router.refresh();
    } finally {
      setWithdrawBusy(false);
    }
  }

  async function doWithdraw() {
    if (raid.status === 'announced' && mySignups.some((s) => s.setConfirmed)) {
      setWithdrawReason('');
      setWithdrawDialogOpen(true);
      setMyMenuOpen(false);
      return;
    }
    if (!window.confirm(t('withdrawConfirm'))) return;
    await runWithdrawDelete();
  }

  async function submitWithdrawWithReason() {
    const r = withdrawReason.trim();
    if (r.length < WITHDRAW_REASON_MIN) return;
    setWithdrawDialogOpen(false);
    await runWithdrawDelete(r);
    setWithdrawReason('');
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-border pb-5">
        <div className="min-w-0 space-y-1 flex-1">
          <p className="text-sm text-muted-foreground">
            {dungeonName} · {raid.guild.name} · {dateShort}
          </p>
          <div className="flex items-start gap-2">
            <h1 className="text-2xl font-bold text-foreground tracking-tight min-w-0 flex-1">
              {raid.name}
            </h1>
            {canEdit ? (
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
            ) : null}
          </div>
          <p className="text-base text-foreground/90">
            <span className="text-muted-foreground">{t('raidSlotLabel')}:</span> {raidTermin}
          </p>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-card/40 shadow-sm overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <h2 className="text-sm font-semibold text-foreground shrink-0">
            {t('sectionOverview')}
          </h2>
          <RaidOverviewSummaryRows
            roleStats={roleStats}
            roleMinByKey={roleMinByKey}
            minSpecsObj={minSpecsObj}
            specCountsByType={specCountsByType}
          />
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
            <div className="mt-4 rounded-lg border border-border bg-muted/15 p-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                {t('note')}
              </h3>
              <p className="text-sm whitespace-pre-wrap">{raid.note}</p>
            </div>
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
          {(hasMySignup && (raid.status === 'open' || raid.status === 'announced')) ||
          (!hasMySignup && canSignup && (raid.status === 'open' || raid.status === 'announced')) ? (
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-muted shrink-0"
              aria-label={t('mySignupMenu')}
              title={t('mySignupMenu')}
              onClick={(e) => {
                e.stopPropagation();
                const pos = openMenuAtButton(e.currentTarget);
                setMyMenuPos(pos);
                setMyMenuOpen((o) => !o);
              }}
            >
              <span className="text-lg leading-none">☰</span>
            </button>
          ) : null}
        </div>
        <div className="p-4 space-y-3">
          {hasMySignup ? (
            <>
              <div className="flex flex-col gap-3">
                {mySignups.map((signup, idx) => {
                  const myChar = signup.characterId
                    ? characters.find((c) => c.id === signup.characterId)
                    : null;
                  const myDiscord = myChar?.guildDiscordDisplayName?.trim();
                  return (
                    <div
                      key={signup.id}
                      className="flex flex-wrap items-center gap-x-2 gap-y-2 justify-between border-b border-border/60 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
                        {myChar ? (
                          <>
                            <div className="flex shrink-0 items-center justify-center w-6 h-8">
                              <CharacterMainStar
                                isMain={!!myChar.isMain}
                                titleMain={tProfile('mainLabel')}
                                titleAlt={tProfile('altLabel')}
                                sizePx={18}
                              />
                            </div>
                            {myChar.classId ? (
                              <span className="flex shrink-0 items-center justify-center w-8 h-8">
                                <ClassIcon classId={myChar.classId} size={26} title={myChar.mainSpec} />
                              </span>
                            ) : null}
                            <SignupSpecIcons
                              character={{
                                mainSpec: myChar.mainSpec,
                                offSpec: myChar.offSpec,
                              }}
                              signedSpec={signup.signedSpec}
                              onlySignedSpec={signup.onlySignedSpec}
                              viewerIsRaidLeader={canEdit}
                            />
                            {signup.isLate ? (
                              <span className="text-base shrink-0" title={t('lateCheckbox')}>
                                ⏱
                              </span>
                            ) : null}
                            <CharacterNameWithDiscordInline
                              name={myChar.name}
                              discordName={myDiscord}
                              className="font-semibold text-foreground truncate"
                            />
                            {myChar.hasBattlenet ? (
                              <BattlenetLogo size={18} title={tProfile('bnetLinkedBadgeTitle')} />
                            ) : null}
                            <CharacterGearscoreBadge
                              characterId={myChar.id}
                              hasBattlenet={myChar.hasBattlenet}
                              gearScore={myChar.gearScore}
                            />
                            {idx === 0 ? (
                              <>
                                <span className="text-muted-foreground hidden sm:inline">·</span>
                                {statusIcon ? (
                                  <span className="shrink-0" title={tDash('myStatus')}>
                                    {statusIcon}
                                  </span>
                                ) : null}
                              </>
                            ) : null}
                            <span className="text-sm font-medium text-foreground">
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
                          </>
                        ) : (
                          <span className="text-sm text-muted-foreground">{t('signupAnonymous')}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  className="shrink-0 rounded-md border border-border bg-background px-2 py-1 text-sm hover:bg-muted"
                  onClick={() => setExpandedNote((v) => !v)}
                  aria-label={tDash('toggleNote')}
                  title={tDash('toggleNote')}
                >
                  📒
                </button>
              </div>
              {expandedNote ? (
                <div className="rounded-md border border-border bg-muted/25 px-3 py-2 text-xs text-muted-foreground space-y-2">
                  {mySignups.map((signup) => {
                    const ch = signup.characterId
                      ? characters.find((c) => c.id === signup.characterId)
                      : null;
                    const line = signup.note?.trim() ?? '';
                    return (
                      <p key={signup.id} className="whitespace-pre-wrap">
                        <span className="font-medium text-foreground">{ch?.name ?? '—'}: </span>
                        {line.length > 0 ? line : tDash('noteHint')}
                      </p>
                    );
                  })}
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{tDash('notSignedUp')}</p>
          )}

          {canSignup && (raid.status === 'open' || raid.status === 'announced') && !hasMySignup ? (
            <button
              type="button"
              onClick={() => setShowSignup(true)}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              ➕ {tDash('signupStart')}
            </button>
          ) : null}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">{t('anmeldungenHeading')}</h2>
        {raid.signupVisibility === 'raid_leader_only' && !canEdit && (
          <p className="text-xs text-muted-foreground">{t('signupListHidden')}</p>
        )}
        <RaidAnmeldungen rows={rows} canEdit={canEdit} />
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

      {myMenuOpen && myMenuPos
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-[995] bg-black/20"
                onMouseDown={() => setMyMenuOpen(false)}
              />
              <div
                className="fixed z-[1000] w-48 rounded-md border border-border bg-background shadow-lg overflow-hidden"
                style={{ top: myMenuPos.top, left: myMenuPos.left }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {hasMySignup && (raid.status === 'open' || raid.status === 'announced') ? (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted"
                    onClick={() => {
                      setMyMenuOpen(false);
                      setShowSignup(true);
                    }}
                  >
                    ⚙️ {t('signupEditMenu')}
                  </button>
                ) : null}
                {hasMySignup && (raid.status === 'open' || raid.status === 'announced') ? (
                  <button
                    type="button"
                    disabled={withdrawBusy}
                    className="w-full text-left px-3 py-2.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    onClick={() => void doWithdraw()}
                  >
                    ➖ {t('withdraw')}
                  </button>
                ) : null}
                {!hasMySignup && canSignup && (raid.status === 'open' || raid.status === 'announced') ? (
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted"
                    onClick={() => {
                      setMyMenuOpen(false);
                      setShowSignup(true);
                    }}
                  >
                    ➕ {tDash('signupStart')}
                  </button>
                ) : null}
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
              onClick={() => setWithdrawDialogOpen(false)}
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
                      onClick={() => setWithdrawDialogOpen(false)}
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
