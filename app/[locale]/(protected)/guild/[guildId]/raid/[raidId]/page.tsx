import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { prisma } from '@/lib/prisma';
import { RaidSignupForm } from '@/components/raid-detail/raid-signup-form';
import {
  filterSignupsVisibleToViewer,
  getRaidDetailContext,
  parseRaidPageMode,
  type RaidPageMode,
} from '@/lib/raid-detail-access';

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

  const { raid, canEdit, canSignup } = ctx;
  const base = `/${locale}/guild/${guildId}/raid/${raidId}`;

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

  const dungeonName = raid.dungeon.names[0]?.name ?? raid.dungeon.name;
  const formatDt = (d: Date) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(d));

  const visibleSignups = filterSignupsVisibleToViewer(
    raid.signups,
    userId,
    raid.signupVisibility,
    canEdit
  );

  const characters = await prisma.rfCharacter.findMany({
    where: { userId, guildId },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const mySignup = raid.signups.find((s) => s.userId === userId);

  const visibilityLabel =
    raid.signupVisibility === 'raid_leader_only'
      ? t('visibilityLeaders')
      : t('visibilityPublic');

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">{raid.name}</h1>
        <Link
          href={`/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`}
          className="text-sm text-muted-foreground hover:text-foreground hover:underline shrink-0"
        >
          {t('backDashboard')}
        </Link>
      </div>

      <p className="text-xs text-muted-foreground">{t('modeQueryHint')}</p>

      <nav className="flex flex-wrap gap-2" aria-label="Raid-Ansicht">
        <Link href={base} className={modeNavClass(mode === 'view')}>
          {t('modeView')}
        </Link>
        {canEdit ? (
          <Link href={`${base}?mode=edit`} className={modeNavClass(mode === 'edit')}>
            {t('modeEdit')}
          </Link>
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
        <section className="space-y-4" aria-labelledby="raid-view-heading">
          <h2 id="raid-view-heading" className="text-lg font-semibold">
            {t('sectionView')}
          </h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{t('dungeon')}</dt>
              <dd>{dungeonName}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('guild')}</dt>
              <dd>{raid.guild.name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('scheduledAt')}</dt>
              <dd>{formatDt(raid.scheduledAt)}</dd>
            </div>
            {raid.scheduledEndAt && (
              <div>
                <dt className="text-muted-foreground">{t('scheduledEndAt')}</dt>
                <dd>{formatDt(raid.scheduledEndAt)}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">{t('signupUntil')}</dt>
              <dd>{formatDt(raid.signupUntil)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('maxPlayers')}</dt>
              <dd>
                {raid._count.signups} / {raid.maxPlayers}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('status')}</dt>
              <dd className="capitalize">{raid.status}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('visibility')}</dt>
              <dd>{visibilityLabel}</dd>
            </div>
            {raid.raidGroupRestriction && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">{t('restriction')}</dt>
                <dd>{raid.raidGroupRestriction.name}</dd>
              </div>
            )}
            {raid.note && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">{t('note')}</dt>
                <dd className="whitespace-pre-wrap">{raid.note}</dd>
              </div>
            )}
          </dl>

          <div>
            <h3 className="text-sm font-medium mb-2">{t('signupList')}</h3>
            {raid.signupVisibility === 'raid_leader_only' && !canEdit && (
              <p className="text-xs text-muted-foreground mb-2">{t('signupListHidden')}</p>
            )}
            {visibleSignups.length === 0 ? (
              <p className="text-muted-foreground text-sm">—</p>
            ) : (
              <ul className="list-disc list-inside text-sm space-y-1">
                {visibleSignups.map((s) => (
                  <li key={s.id}>
                    {s.character?.name ?? t('signupAnonymous')} ({s.type}
                    {s.allowReserve ? `, ${t('signupReserveOk')}` : ''})
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {mode === 'edit' && canEdit && (
        <section className="space-y-4" aria-labelledby="raid-edit-heading">
          <h2 id="raid-edit-heading" className="text-lg font-semibold">
            {t('sectionEdit')}
          </h2>
          <p className="text-muted-foreground text-sm">{t('editPlaceholder')}</p>
          {raid.discordThreadId && (
            <p className="text-sm">
              <span className="text-muted-foreground">{t('discordThread')}: </span>
              <code className="text-xs bg-muted px-1 py-0.5 rounded">{raid.discordThreadId}</code>
            </p>
          )}
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
            initialCharacterId={mySignup?.characterId ?? null}
            initialType={mySignup?.type ?? 'main'}
            initialAllowReserve={mySignup?.allowReserve ?? false}
          />
          <div>
            <h3 className="text-sm font-medium mb-2">{t('signupList')}</h3>
            {raid.signupVisibility === 'raid_leader_only' && !canEdit && (
              <p className="text-xs text-muted-foreground mb-2">{t('signupListHidden')}</p>
            )}
            {visibleSignups.length === 0 ? (
              <p className="text-muted-foreground text-sm">—</p>
            ) : (
              <ul className="list-disc list-inside text-sm space-y-1">
                {visibleSignups.map((s) => (
                  <li key={s.id}>
                    {s.character?.name ?? t('signupAnonymous')} ({s.type})
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
