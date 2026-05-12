import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getTranslations } from 'next-intl/server';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { getRaidDetailContext } from '@/lib/raid-detail-access';
import { parseStoredAnnouncedPlannerJson } from '@/lib/raid-announce';
import { normalizeSignupPunctuality } from '@/lib/raid-signup-constants';
import { getSpecByDisplayName, type TbcRole } from '@/lib/wow-tbc-classes';
import { roleFromSpecDisplayName } from '@/lib/spec-to-role';
import { prisma } from '@/lib/prisma';
import {
  RaidCompleteClient,
  type RaidCompleteSignupRow,
} from '@/components/raid-complete/raid-complete-client';
import type { GuildCharacterOption } from '@/components/raid-planner/raid-roster-planner';

export default async function RaidCompletePage(props: {
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
        <p className="text-muted-foreground text-sm">{t('forbiddenEdit')}</p>
        <Link href={`/${locale}/guild/${guildId}/raid/${raidId}`} className="text-sm text-primary hover:underline">
          {t('modeView')}
        </Link>
      </div>
    );
  }

  const { raid } = ctx;
  if (raid.status === 'completed') {
    redirect(`/${locale}/guild/${guildId}/raid/${raidId}`);
  }
  if (raid.status === 'cancelled') {
    redirect(`/${locale}/guild/${guildId}/raid/${raidId}`);
  }
  if (raid.status !== 'open' && raid.status !== 'announced' && raid.status !== 'locked') {
    redirect(`/${locale}/guild/${guildId}/raid/${raidId}`);
  }

  const rawJson =
    raid.status === 'open'
      ? (raid as unknown as { draftPlannerGroupsJson?: unknown }).draftPlannerGroupsJson
      : (raid as unknown as { announcedPlannerGroupsJson?: unknown }).announcedPlannerGroupsJson;
  const parsed = parseStoredAnnouncedPlannerJson(rawJson);
  const initialGroups: string[][] =
    parsed && parsed.groups.length > 0 ? parsed.groups.map((g) => [...g.rosterOrder]) : [[]];

  const dungeonName =
    raid.dungeonNames && raid.dungeonNames.length > 0
      ? raid.dungeonNames.join(' / ')
      : raid.dungeon.names[0]?.name ?? raid.dungeon.name;

  const initialSignups: RaidCompleteSignupRow[] = raid.signups.map((s) => {
    const ch = s.character;
    const mainSpec = (ch?.mainSpec || '—').trim() || '—';
    const offSpec = ch?.offSpec?.trim() ? ch.offSpec : null;
    const eff = (s.signedSpec?.trim() || mainSpec).trim();
    const classId = getSpecByDisplayName(eff)?.classId ?? getSpecByDisplayName(mainSpec)?.classId ?? null;
    const punctRaw = normalizeSignupPunctuality(s.punctuality, s.isLate);
    const punctuality: 'on_time' | 'tight' | 'late' =
      punctRaw === 'tight' || punctRaw === 'late' || punctRaw === 'on_time' ? punctRaw : 'on_time';
    return {
      id: s.id,
      userId: s.userId,
      characterId: ch?.id ?? null,
      name: ch?.name?.trim() || t('signupAnonymous'),
      mainSpec,
      offSpec,
      classId,
      signedSpec: s.signedSpec,
      originalSignedSpec: mainSpec,
      onlySignedSpec: s.onlySignedSpec,
      isMain: !!ch?.isMain,
      guildDiscordDisplayName: ch?.guildDiscordDisplayName ?? null,
      role: (roleFromSpecDisplayName(eff) ?? 'Melee') as TbcRole,
      signupType: s.type,
      punctuality,
      isLate: s.isLate,
      forbidReserve: s.forbidReserve,
      note: s.note,
      gearScore: ch?.gearScore ?? null,
    };
  });

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
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto">
      <RaidCompleteClient
        guildId={guildId}
        raidId={raidId}
        raid={{
          name: raid.name,
          scheduledAt: raid.scheduledAt.toISOString(),
          scheduledEndAt: raid.scheduledEndAt?.toISOString() ?? null,
          guildName: raid.guild.name,
          dungeonLabel: dungeonName,
          maxPlayers: raid.maxPlayers,
        }}
        organizerLabel={organizerLabel}
        initialGroups={initialGroups}
        initialSignups={initialSignups}
        guildCharacters={guildCharacters}
      />
    </div>
  );
}
