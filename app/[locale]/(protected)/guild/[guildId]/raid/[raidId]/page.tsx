import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { getSpecByDisplayName } from '@/lib/wow-tbc-classes';
import { roleFromSpecDisplayName } from '@/lib/spec-to-role';
import { RaidDetailView } from '@/components/raid-detail/raid-detail-view';
import {
  getRaidDetailContext,
  parseRaidPageMode,
  type RaidPageMode,
} from '@/lib/raid-detail-access';
import { findManyRfCharactersForDashboard } from '@/lib/rf-character-gear-score-compat';

type SearchParams = Promise<{ mode?: string; modus?: string }>;

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

  if (mode === 'edit' && canEdit) {
    redirect(`/${locale}/guild/${guildId}/raid/${raidId}/edit`);
  }
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

  const charRows = await findManyRfCharactersForDashboard(userId);
  const characters = charRows
    .filter((c) => c.guildId === guildId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({
      id: c.id,
      name: c.name,
      mainSpec: c.mainSpec,
      offSpec: c.offSpec,
      isMain: c.isMain,
      classId: getSpecByDisplayName(c.mainSpec)?.classId ?? null,
      gearScore: c.gearScore,
      hasBattlenet: !!c.battlenetProfile?.battlenetCharacterId,
      guildDiscordDisplayName: c.guildDiscordDisplayName,
    }));

  const mySignup = raid.signups.find((s) => s.userId === userId);
  const mySignupSerialized = mySignup
    ? {
        id: mySignup.id,
        characterId: mySignup.characterId,
        type: mySignup.type,
        isLate: mySignup.isLate,
        note: mySignup.note,
        signedSpec: mySignup.signedSpec,
        onlySignedSpec: mySignup.onlySignedSpec,
        forbidReserve: mySignup.forbidReserve,
        leaderPlacement: mySignup.leaderPlacement,
        setConfirmed: mySignup.setConfirmed,
      }
    : null;

  const typeNorm = (v: string) => (v === 'main' ? 'normal' : v);
  const roleStats = {
    Tank: { normal: 0, uncertain: 0, reserve: 0 },
    Melee: { normal: 0, uncertain: 0, reserve: 0 },
    Range: { normal: 0, uncertain: 0, reserve: 0 },
    Healer: { normal: 0, uncertain: 0, reserve: 0 },
  };
  for (const s of raid.signups) {
    const spec = (s.signedSpec?.trim() || s.character?.mainSpec?.trim() || null) as string | null;
    const role = roleFromSpecDisplayName(spec);
    const tn = typeNorm(s.type);
    if (!role || !(role in roleStats)) continue;
    if (tn === 'normal' || tn === 'uncertain' || tn === 'reserve') {
      roleStats[role as keyof typeof roleStats][tn]++;
    }
  }

  const raidForView = {
    ...raid,
    scheduledAt: raid.scheduledAt.toISOString(),
    scheduledEndAt: raid.scheduledEndAt?.toISOString() ?? null,
    signupUntil: raid.signupUntil.toISOString(),
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <Link
          href={`/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`}
          className="text-sm text-muted-foreground hover:text-foreground hover:underline shrink-0 sm:ml-auto order-first sm:order-none"
        >
          {t('backDashboard')}
        </Link>
      </div>

      <RaidDetailView
        locale={locale}
        guildId={guildId}
        raidId={raidId}
        userId={userId}
        raid={raidForView}
        roleStats={roleStats}
        canEdit={canEdit}
        canEditRaid={canEditRaid}
        canSignup={canSignup}
        signupPhase={signupPhase}
        characters={characters}
        mySignup={mySignupSerialized}
        initialSignupOpen={mode === 'signup' && canSignup}
      />
    </div>
  );
}
