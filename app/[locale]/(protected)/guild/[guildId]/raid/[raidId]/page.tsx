import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { getSpecByDisplayName } from '@/lib/wow-tbc-classes';
import { RaidDetailView, type AnnouncedLayoutProps } from '@/components/raid-detail/raid-detail-view';
import { parseStoredAnnouncedPlannerJson } from '@/lib/raid-announce';
import {
  getRaidDetailContext,
  parseRaidPageMode,
  type RaidPageMode,
} from '@/lib/raid-detail-access';
import { findManyRfCharactersForDashboard } from '@/lib/rf-character-gear-score-compat';
import { prisma } from '@/lib/prisma';
import { normalizeSignupPunctuality } from '@/lib/raid-signup-constants';

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

  const mySignupsSerialized = raid.signups
    .filter((s) => s.userId === userId)
    .map((s) => ({
      id: s.id,
      characterId: s.characterId ?? null,
      type: s.type,
      isLate: s.isLate,
      punctuality: normalizeSignupPunctuality(s.punctuality, s.isLate),
      note: s.note,
      signedSpec: s.signedSpec,
      onlySignedSpec: s.onlySignedSpec,
      forbidReserve: s.forbidReserve,
      leaderPlacement: s.leaderPlacement,
      setConfirmed: s.setConfirmed,
    }));

  let announcedLayout: AnnouncedLayoutProps | null = null;
  if (raid.status === 'announced') {
    const raw = (raid as unknown as { announcedPlannerGroupsJson?: unknown }).announcedPlannerGroupsJson;
    const parsed = parseStoredAnnouncedPlannerJson(raw);
    if (parsed) {
      const uids = new Set<string>();
      for (const g of parsed.groups) {
        if (g.raidLeaderUserId) uids.add(g.raidLeaderUserId);
        if (g.lootmasterUserId) uids.add(g.lootmasterUserId);
      }
      const chars =
        uids.size > 0
          ? await prisma.rfCharacter.findMany({
              where: { guildId, userId: { in: Array.from(uids) } },
              select: {
                userId: true,
                name: true,
                guildDiscordDisplayName: true,
                isMain: true,
              },
            })
          : [];
      const labelForUser = (uid: string): string => {
        const list = chars.filter((c) => c.userId === uid);
        list.sort((a, b) => Number(b.isMain) - Number(a.isMain));
        const c = list[0];
        const d = c?.guildDiscordDisplayName?.trim();
        if (d) return d;
        if (c?.name?.trim()) return c.name.trim();
        return `…${uid.slice(-6)}`;
      };
      announcedLayout = {
        groupMeta: parsed.groups.map((g) => ({
          rosterOrder: g.rosterOrder,
          raidLeaderLabel: g.raidLeaderUserId ? labelForUser(g.raidLeaderUserId) : null,
          lootmasterLabel: g.lootmasterUserId ? labelForUser(g.lootmasterUserId) : null,
        })),
        reserveOrder: parsed.reserveOrder,
      };
    }
  }

  const raidForView = {
    ...raid,
    scheduledAt: raid.scheduledAt.toISOString(),
    scheduledEndAt: raid.scheduledEndAt?.toISOString() ?? null,
    signupUntil: raid.signupUntil.toISOString(),
  };

  const dungeonLabel =
    raid.dungeonNames && raid.dungeonNames.length > 0
      ? raid.dungeonNames.join(' / ')
      : raid.dungeon.names[0]?.name ?? raid.dungeon.name;

  const organizerDiscordId = raid.organizerDiscordId?.trim() ?? null;
  let organizerLabel: string | null = null;
  if (organizerDiscordId) {
    const orgUser = await prisma.rfUser.findUnique({
      where: { discordId: organizerDiscordId },
      select: { id: true },
    });
    if (orgUser) {
      const orgChar = await prisma.rfCharacter.findFirst({
        where: { userId: orgUser.id, guildId, guildDiscordDisplayName: { not: null } },
        select: { guildDiscordDisplayName: true, name: true, isMain: true },
        orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
      });
      organizerLabel =
        orgChar?.guildDiscordDisplayName?.trim() || orgChar?.name?.trim() || null;
    }
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto space-y-6">
      <RaidDetailView
        locale={locale}
        guildId={guildId}
        raidId={raidId}
        userId={userId}
        raid={raidForView}
        dungeonLabel={dungeonLabel}
        organizerLabel={organizerLabel}
        canEdit={canEdit}
        canEditRaid={canEditRaid}
        canSignup={canSignup}
        signupPhase={signupPhase}
        characters={characters}
        mySignups={mySignupsSerialized}
        initialSignupOpen={mode === 'signup' && canSignup}
        announcedLayout={announcedLayout}
      />
    </div>
  );
}
