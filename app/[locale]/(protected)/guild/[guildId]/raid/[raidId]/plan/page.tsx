import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { getSpecByDisplayName, type TbcRole } from '@/lib/wow-tbc-classes';
import { roleFromSpecDisplayName } from '@/lib/spec-to-role';
import { prisma } from '@/lib/prisma';
import {
  RaidRosterPlanner,
  type GuildCharacterOption,
  type RosterPlannerSignup,
} from '@/components/raid-planner/raid-roster-planner';
import { getRaidDetailContext } from '@/lib/raid-detail-access';
import { filterSignupsVisibleToViewer } from '@/lib/raid-detail-shared';
import { buildSpecStatsByMinKeys } from '@/lib/min-spec-keys';

export default async function RaidPlanPage(props: {
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
  const tPlan = await getTranslations('raidRosterPlanner');
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

  if (!ctx.canEdit) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-4">
        <h1 className="text-2xl font-bold text-foreground">{ctx.raid.name}</h1>
        <p className="text-muted-foreground text-sm">{tPlan('forbiddenPlan')}</p>
        <Link
          href={`/${locale}/guild/${guildId}/raid/${raidId}`}
          className="text-sm text-primary hover:underline"
        >
          {t('modeView')}
        </Link>
      </div>
    );
  }

  const { raid } = ctx;
  const canEditRaid = raid.status === 'open';

  const ROLE_KEYS = ['Tank', 'Melee', 'Range', 'Healer'] as const;
  type RoleStat = { normal: number; uncertain: number; reserve: number };

  const typeNorm = (v: string) => (v === 'main' ? 'normal' : v);

  const roleStats: Record<(typeof ROLE_KEYS)[number], RoleStat> = {
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

  const minSpecsObj =
    raid.minSpecs && typeof raid.minSpecs === 'object' && !Array.isArray(raid.minSpecs)
      ? (raid.minSpecs as Record<string, number>)
      : null;

  const specCountsByType: Record<string, RoleStat> = buildSpecStatsByMinKeys(
    raid.signups.map((s) => ({
      type: s.type,
      signedSpec: s.signedSpec,
      character: s.character ? { mainSpec: s.character.mainSpec } : null,
    })),
    minSpecsObj
  );

  const roleMinByKey: Record<(typeof ROLE_KEYS)[number], number> = {
    Tank: raid.minTanks,
    Melee: raid.minMelee,
    Range: raid.minRange,
    Healer: raid.minHealers,
  };

  const dungeonName =
    raid.dungeonNames && raid.dungeonNames.length > 0
      ? raid.dungeonNames.join(' / ')
      : raid.dungeon.names[0]?.name ?? raid.dungeon.name;

  const visibleSignups = filterSignupsVisibleToViewer(
    raid.signups,
    userId,
    raid.signupVisibility,
    ctx.canEdit,
    raid.status
  );

  const initialSignups: RosterPlannerSignup[] = visibleSignups
    .map((s) => {
      const ch = s.character;
      const name = ch?.name?.trim() || t('signupAnonymous');
      const mainSpec = (ch?.mainSpec || s.signedSpec || '—').trim() || '—';
      const offSpec = ch?.offSpec ?? null;
      const spec = (s.signedSpec?.trim() || ch?.mainSpec?.trim() || '') as string;
      const rawRole = roleFromSpecDisplayName(spec);
      const role = (rawRole ?? 'Melee') as TbcRole;
      const classId = getSpecByDisplayName(mainSpec)?.classId ?? null;
      return {
        id: s.id,
        userId: s.userId,
        characterId: ch?.id ?? null,
        name,
        mainSpec,
        offSpec,
        classId,
        isMain: !!ch?.isMain,
        role,
        signedSpec: s.signedSpec,
        originalSignedSpec: (s.signedSpec?.trim() || ch?.mainSpec?.trim() || null) as string | null,
        onlySignedSpec: s.onlySignedSpec,
        signupType: s.type,
        isLate: s.isLate,
        punctuality: (s.punctuality === 'tight' || s.punctuality === 'late' || s.punctuality === 'on_time'
          ? s.punctuality
          : s.isLate
            ? 'late'
            : 'on_time') as 'on_time' | 'tight' | 'late',
        forbidReserve: s.forbidReserve,
        discordName: ch?.guildDiscordDisplayName ?? null,
        gearScore: (ch as unknown as { gearScore?: number | null })?.gearScore ?? null,
        note: s.note ?? null,
        profileWeekFocus: null,
      };
    })
    .filter((row) => row.name.length > 0);

  const guildChars = await prisma.rfCharacter.findMany({
    where: { guildId },
    select: {
      id: true,
      userId: true,
      name: true,
      mainSpec: true,
      offSpec: true,
      isMain: true,
      gearScore: true,
      guildDiscordDisplayName: true,
    },
    orderBy: [{ name: 'asc' }],
  });

  const guildCharacters: GuildCharacterOption[] = guildChars.map((c) => {
    const role = (roleFromSpecDisplayName(c.mainSpec) ?? 'Melee') as TbcRole;
    return {
      id: c.id,
      userId: c.userId,
      name: c.name,
      mainSpec: c.mainSpec,
      offSpec: c.offSpec,
      isMain: c.isMain,
      gearScore: c.gearScore ?? null,
      guildDiscordDisplayName: c.guildDiscordDisplayName ?? null,
      classId: getSpecByDisplayName(c.mainSpec)?.classId ?? null,
      role,
    };
  });

  const leaderChar = await prisma.rfCharacter.findFirst({
    where: { userId, guildId, guildDiscordDisplayName: { not: null } },
    select: { guildDiscordDisplayName: true },
    orderBy: [{ isMain: 'desc' }],
  });
  const raidLeaderLabel = leaderChar?.guildDiscordDisplayName?.trim() || discordId;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <Link
          href={`/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`}
          className="text-sm text-muted-foreground hover:text-foreground hover:underline shrink-0 sm:ml-auto order-first sm:order-none"
        >
          {t('backDashboard')}
        </Link>
      </div>

      <RaidRosterPlanner
        locale={locale}
        guildId={guildId}
        raidId={raidId}
        canEditRaid={canEditRaid}
        guildCharacters={guildCharacters}
        raidLeaderLabel={raidLeaderLabel}
        raid={{
          name: raid.name,
          scheduledAt: raid.scheduledAt.toISOString(),
          scheduledEndAt: raid.scheduledEndAt?.toISOString() ?? null,
          guildName: raid.guild.name,
          dungeonLabel: dungeonName,
          maxPlayers: raid.maxPlayers,
        }}
        overviewProps={{
          roleStats,
          roleMinByKey,
          minSpecsObj,
          specCountsByType,
        }}
        initialSignups={initialSignups}
      />
    </div>
  );
}
