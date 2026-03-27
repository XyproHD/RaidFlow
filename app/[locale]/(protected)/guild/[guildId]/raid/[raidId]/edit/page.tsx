import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { getRaidDetailContext } from '@/lib/raid-detail-access';
import { RaidEditBasicsPage } from '@/components/raid-edit/raid-edit-basics-page';
import type { RaidEditSerialized } from '@/components/raid-edit/raid-edit-panel';

export default async function RaidEditStandalonePage(props: {
  params: Promise<{ locale: string; guildId: string; raidId: string }>;
}) {
  const { locale, guildId, raidId } = await props.params;
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
    if (ctx.reason === 'raid_not_found') notFound();
    const msg =
      ctx.reason === 'guild_not_found' ? t('forbiddenGuild') : t('forbiddenAccess');
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-4">
        <p className="text-muted-foreground">{msg}</p>
      </div>
    );
  }

  if (!ctx.canEdit) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-foreground">{ctx.raid.name}</h1>
        <p className="text-destructive text-sm">{t('forbiddenEdit')}</p>
        <Link
          href={`/${locale}/guild/${guildId}/raid/${raidId}`}
          className="text-sm text-primary hover:underline"
        >
          {t('modeView')}
        </Link>
      </div>
    );
  }

  const raidForEdit: RaidEditSerialized = {
    id: ctx.raid.id,
    guildId: ctx.raid.guildId,
    dungeonId: ctx.raid.dungeonId,
    dungeonIds: Array.isArray(ctx.raid.dungeonIds)
      ? (ctx.raid.dungeonIds as string[])
      : null,
    name: ctx.raid.name,
    note: ctx.raid.note,
    raidLeaderId: ctx.raid.raidLeaderId,
    lootmasterId: ctx.raid.lootmasterId,
    minTanks: ctx.raid.minTanks,
    minMelee: ctx.raid.minMelee,
    minRange: ctx.raid.minRange,
    minHealers: ctx.raid.minHealers,
    minSpecs: ctx.raid.minSpecs,
    raidGroupRestrictionId: ctx.raid.raidGroupRestrictionId,
    maxPlayers: ctx.raid.maxPlayers,
    scheduledAt: ctx.raid.scheduledAt.toISOString(),
    scheduledEndAt: ctx.raid.scheduledEndAt?.toISOString() ?? null,
    signupUntil: ctx.raid.signupUntil.toISOString(),
    signupVisibility: ctx.raid.signupVisibility,
    status: ctx.raid.status,
    discordThreadId: ctx.raid.discordThreadId,
    dungeon: {
      id: ctx.raid.dungeon.id,
      name: ctx.raid.dungeon.names[0]?.name ?? ctx.raid.dungeon.name,
    },
    raidGroupRestriction: ctx.raid.raidGroupRestriction,
    signups: ctx.raid.signups.map((s) => ({
      id: s.id,
      userId: s.userId,
      characterId: s.characterId,
      type: s.type,
      signedSpec: s.signedSpec,
      onlySignedSpec: s.onlySignedSpec,
      forbidReserve: s.forbidReserve,
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
    <div className="p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto mb-4">
        <Link
          href={`/${locale}/guild/${guildId}/raid/${raidId}`}
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          {t('modeView')}
        </Link>
      </div>
      <RaidEditBasicsPage guildId={guildId} raidId={raidId} initialRaid={raidForEdit} />
    </div>
  );
}

