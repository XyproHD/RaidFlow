import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { prisma } from '@/lib/prisma';
import { getSpecByDisplayName } from '@/lib/wow-tbc-classes';
import { RaidSignupForm } from '@/components/raid-detail/raid-signup-form';
import { RaidSignupWithdraw } from '@/components/raid-detail/raid-signup-withdraw';
import {
  RaidViewSection,
  type RaidViewRaid,
} from '@/components/raid-detail/raid-view-section';
import { RaidSignupHistoryPanel } from '@/components/raid-detail/raid-signup-history';
import {
  RaidAnmeldungen,
  type AnmeldungRow,
} from '@/components/raid-detail/raid-anmeldungen';
import {
  filterSignupsVisibleToViewer,
  getRaidDetailContext,
  parseRaidPageMode,
  type RaidPageMode,
} from '@/lib/raid-detail-access';
import { getParticipationStatsForUsers } from '@/lib/raid-participation-stats';
import {
  RaidEditPanel,
  type RaidEditSerialized,
} from '@/components/raid-edit/raid-edit-panel';

type SearchParams = Promise<{ mode?: string; modus?: string }>;

function modeNavClass(active: boolean) {
  return active
    ? 'text-sm px-3 py-1.5 rounded-md border border-primary bg-primary/10 text-foreground font-medium'
    : 'text-sm px-3 py-1.5 rounded-md border border-transparent text-muted-foreground hover:border-border';
}

export default async function RaidDetailPage(props: {
  params: Promise<{ locale: string; guildId: string; raidId: string }>;
  searchParams?: SearchParams;
}) {
  const { locale, guildId, raidId } = await props.params;
  const sp = props.searchParams ? await props.searchParams : {};
  const mode: RaidPageMode = parseRaidPageMode(sp);

  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(
    session as { userId?: string; discordId?: string } | null
  );
  const discordId = (session as { discordId?: string } | null)?.discordId;

  if (!userId || !discordId) {
    redirect(`/${locale}`);
  }

  const t = await getTranslations('raidDetail');
  const ctx = await getRaidDetailContext(userId, discordId, guildId, raidId, locale);

  if (!ctx.ok) {
    if (ctx.reason === 'raid_not_found') {
      notFound();
    }
    const msg =
      ctx.reason === 'guild_not_found' ? t('forbiddenGuild') : t('forbiddenAccess');
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-4">
        <p className="text-muted-foreground">{msg}</p>
        <Link
          href={`/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`}
          className="text-sm text-primary hover:underline"
        >
          {t('backDashboard')}
        </Link>
      </div>
    );
  }

  const { raid, canEdit, canSignup, signupPhase } = ctx;
  const base = `/${locale}/guild/${guildId}/raid/${raidId}`;
  const canEditRaid = canEdit && raid.status === 'open';

  if (mode === 'edit' && !canEdit) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-foreground">{raid.name}</h1>
        <p className="text-destructive text-sm">{t('forbiddenEdit')}</p>
        <Link href={base} className="text-sm text-primary hover:underline">
          {t('modeView')}
        </Link>
      </div>
    );
  }

  if (mode === 'signup' && !canSignup) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-foreground">{raid.name}</h1>
        <p className="text-muted-foreground text-sm">{t('forbiddenSignupClosed')}</p>
        <Link href={base} className="text-sm text-primary hover:underline">
          {t('modeView')}
        </Link>
      </div>
    );
  }

  const visibleSignups = filterSignupsVisibleToViewer(
    raid.signups,
    userId,
    raid.signupVisibility,
    canEdit,
    raid.status
  );

  const anmeldungRows: AnmeldungRow[] = visibleSignups.map((s) => ({
    id: s.id,
    userId: s.userId,
    character: s.character,
    signedSpec: s.signedSpec,
    type: s.type,
    isLate: s.isLate,
    note: s.note,
    leaderAllowsReserve: s.leaderAllowsReserve,
    leaderMarkedTeilnehmer: s.leaderMarkedTeilnehmer,
  }));

  const charRows = await prisma.rfCharacter.findMany({
    where: { userId, guildId },
    select: { id: true, name: true, mainSpec: true, offSpec: true, isMain: true },
    orderBy: { name: 'asc' },
  });

  const characters = charRows.map((c) => ({
    ...c,
    classId: getSpecByDisplayName(c.mainSpec)?.classId ?? null,
  }));

  const mySignup = raid.signups.find((s) => s.userId === userId);

  const memberRows = await prisma.rfGuildMember.findMany({
    where: { guildId },
    select: { userId: true },
  });
  const statUserIds = [
    ...new Set<string>([
      ...memberRows.map((m) => m.userId),
      ...raid.signups.map((s) => s.userId),
    ]),
  ];
  const participationStatsMap = await getParticipationStatsForUsers(
    prisma,
    guildId,
    raid.dungeonId,
    statUserIds
  );
  const participationStats = Object.fromEntries(participationStatsMap);

  const raidForEdit: RaidEditSerialized = {
    id: raid.id,
    guildId: raid.guildId,
    dungeonId: raid.dungeonId,
    name: raid.name,
    note: raid.note,
    raidLeaderId: raid.raidLeaderId,
    lootmasterId: raid.lootmasterId,
    minTanks: raid.minTanks,
    minMelee: raid.minMelee,
    minRange: raid.minRange,
    minHealers: raid.minHealers,
    minSpecs: raid.minSpecs,
    raidGroupRestrictionId: raid.raidGroupRestrictionId,
    maxPlayers: raid.maxPlayers,
    scheduledAt: raid.scheduledAt.toISOString(),
    scheduledEndAt: raid.scheduledEndAt?.toISOString() ?? null,
    signupUntil: raid.signupUntil.toISOString(),
    signupVisibility: raid.signupVisibility,
    status: raid.status,
    discordThreadId: raid.discordThreadId,
    dungeon: {
      id: raid.dungeon.id,
      name: raid.dungeon.names[0]?.name ?? raid.dungeon.name,
    },
    raidGroupRestriction: raid.raidGroupRestriction,
    signups: raid.signups.map((s) => ({
      id: s.id,
      userId: s.userId,
      characterId: s.characterId,
      type: s.type,
      signedSpec: s.signedSpec,
      isLate: s.isLate,
      note: s.note,
      leaderAllowsReserve: s.leaderAllowsReserve,
      leaderMarkedTeilnehmer: s.leaderMarkedTeilnehmer,
      leaderPlacement: s.leaderPlacement,
      setConfirmed: s.setConfirmed,
      character: s.character,
    })),
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="sr-only">{raid.name}</h1>
        <Link
          href={`/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`}
          className="text-sm text-muted-foreground hover:text-foreground hover:underline shrink-0 sm:ml-auto order-first sm:order-none"
        >
          {t('backDashboard')}
        </Link>
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Raid-Ansicht">
        <Link href={base} className={modeNavClass(mode === 'view')}>
          {t('modeView')}
        </Link>
        {canEdit ? (
          canEditRaid ? (
            <Link href={`${base}?mode=edit`} className={modeNavClass(mode === 'edit')}>
              {t('modeEdit')}
            </Link>
          ) : (
            <span
              className="text-sm px-3 py-1.5 rounded-md border border-border text-muted-foreground cursor-not-allowed"
              title={t('raidEditClosed')}
            >
              {t('modeEdit')}
            </span>
          )
        ) : (
          <span
            className="text-sm px-3 py-1.5 rounded-md border border-border text-muted-foreground cursor-not-allowed"
            title={t('forbiddenEdit')}
          >
            {t('modeEdit')}
          </span>
        )}
        <Link href={`${base}?mode=signup`} className={modeNavClass(mode === 'signup')}>
          {t('modeSignup')}
        </Link>
      </nav>

      {mode === 'view' && (
        <RaidViewSection
          raid={raid as RaidViewRaid}
          locale={locale}
          guildId={guildId}
          raidId={raidId}
          userId={userId}
          canEdit={canEdit}
        />
      )}

      {mode === 'edit' && canEdit && canEditRaid && (
        <section className="space-y-4" aria-labelledby="raid-edit-heading">
          <h2 id="raid-edit-heading" className="text-lg font-semibold">
            {t('sectionEdit')}
          </h2>
          {raid.discordThreadId && (
            <p className="text-sm">
              <span className="text-muted-foreground">{t('discordThread')}: </span>
              <code className="text-xs bg-muted px-1 py-0.5 rounded">{raid.discordThreadId}</code>
            </p>
          )}
          <RaidEditPanel
            guildId={guildId}
            raidId={raidId}
            initialRaid={raidForEdit}
            participationStats={participationStats}
          />
        </section>
      )}
      {mode === 'edit' && canEdit && !canEditRaid && (
        <section className="space-y-2" aria-labelledby="raid-edit-closed-heading">
          <h2 id="raid-edit-closed-heading" className="text-lg font-semibold">
            {t('sectionEdit')}
          </h2>
          <p className="text-muted-foreground text-sm">{t('raidEditClosed')}</p>
        </section>
      )}

      {mode === 'signup' && canSignup && (
        <section className="space-y-6" aria-labelledby="raid-signup-heading">
          <h2 id="raid-signup-heading" className="text-lg font-semibold">
            {t('sectionSignup')}
          </h2>
          <RaidSignupForm
            guildId={guildId}
            raidId={raidId}
            characters={characters}
            signupPhase={signupPhase}
            initialCharacterId={mySignup?.characterId ?? null}
            initialType={mySignup?.type ?? 'normal'}
            initialIsLate={mySignup?.isLate ?? false}
            initialNote={mySignup?.note ?? ''}
            initialSignedSpec={mySignup?.signedSpec ?? null}
            hasExistingSignup={!!mySignup}
          />
          {mySignup && <RaidSignupWithdraw guildId={guildId} raidId={raidId} />}
          {canEdit && <RaidSignupHistoryPanel guildId={guildId} raidId={raidId} />}
          <div className="space-y-2">
            <h3 className="text-base font-semibold">{t('anmeldungenHeading')}</h3>
            {raid.signupVisibility === 'raid_leader_only' &&
              !canEdit &&
              raid.status !== 'locked' && (
              <p className="text-xs text-muted-foreground">{t('signupListHidden')}</p>
            )}
            <RaidAnmeldungen
              rows={anmeldungRows}
              canEdit={canEdit}
              guildId={guildId}
              raidId={raidId}
            />
          </div>
        </section>
      )}
    </div>
  );
}
