import { getTranslations } from 'next-intl/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { getGuildsForUser, getRaidsForUser } from '@/lib/user-guilds';
import { getLocale } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import { getSpecByDisplayName } from '@/lib/wow-tbc-classes';
import { DashboardClient, type DashboardCalendarRaid, type DashboardCharacter, type DashboardGuild, type DashboardSignupRow } from './dashboard-client';

type SearchParams = Promise<{ guild?: string }>;

/** Dashboard: Raid-Übersicht gefiltert nach aktiver Gilde (in Topbar). Empty-States bei keiner Gildenmitgliedschaft bzw. ohne Raider-Rechte. */
export default async function DashboardPage(props: { searchParams?: SearchParams }) {
  try {
    const t = await getTranslations('dashboard');
    const locale = await getLocale();
    const session = await getServerSession(authOptions);
    const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
    const discordId = (session as { discordId?: string } | null)?.discordId;

    let guilds: Awaited<ReturnType<typeof getGuildsForUser>> = [];
    let raids: Awaited<ReturnType<typeof getRaidsForUser>> = [];
    try {
      guilds = userId && discordId ? await getGuildsForUser(userId, discordId) : [];
      raids = await getRaidsForUser(guilds);
    } catch (e) {
      console.error('[Dashboard]', e);
    }

    // ---- helpers (server) ---------------------------------------------------
    function slugify(input: string): string {
      return input
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/['"]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    }

    function armoryVersionFromInternal(v: string | null | undefined): string | null {
      const x = (v ?? '').trim().toLowerCase();
      if (!x) return null;
      if (x === 'classic_era') return 'classic-era';
      if (x === 'classic-era') return 'classic-era';
      if (x === 'hardcore') return 'classic-hardcore';
      if (x === 'classic-hardcore') return 'classic-hardcore';
      if (x === 'season_of_discovery') return 'classic-sod';
      if (x === 'classic-sod') return 'classic-sod';
      if (x === 'anniversary') return 'tbc-anniversary';
      // Older/alternate values used in DB/imports
      if (x === 'tbc' || x === 'tbc_classic' || x === 'classic_tbc' || x === 'classicann' || x === 'tbc-anniversary') return 'tbc-anniversary';
      if (x === 'progression') return 'mop';
      // fallback: allow some older values
      if (x === 'mop') return 'mop';
      return null;
    }

    // ---- data for dashboard -------------------------------------------------
    const dashboardGuilds: DashboardGuild[] = guilds.map((g) => {
      const region = g.battlenetRealm?.region ?? null;
      const internalVersion = g.battlenetRealm?.version ?? null;
      const armoryVersion = armoryVersionFromInternal(internalVersion);
      const realmSlug = (g.battlenetProfileRealmSlug ?? g.battlenetRealm?.slug ?? '').trim() || null;
      // GuildSlug must come from the BNet-linked guild name (searched via API in guild menu),
      // not from the Discord guild name.
      const guildName = (g.battlenetGuildName ?? '').trim() || null;
      const guildSlug = guildName ? slugify(guildName) : null;
      const armoryUrl =
        region && armoryVersion && realmSlug && guildSlug && !!g.battlenetGuildId
          ? `https://classic-armory.org/guild/${encodeURIComponent(region)}/${encodeURIComponent(armoryVersion)}/${encodeURIComponent(realmSlug)}/${encodeURIComponent(guildSlug)}`
          : null;
      const realmLabel =
        region && realmSlug && armoryVersion ? `${region}/${armoryVersion} • ${realmSlug}` : realmSlug ? realmSlug : null;
      const canManage = g.role === 'guildmaster';
      return {
        id: g.id,
        name: g.name,
        role: g.role,
        armoryUrl,
        realmLabel,
        canManage,
      };
    });

    const chars = userId
      ? await prisma.rfCharacter.findMany({
          where: { userId },
          include: { guild: { select: { name: true } } },
          orderBy: [{ guildId: 'asc' }, { isMain: 'desc' }, { name: 'asc' }],
        })
      : [];

    const completionRows = userId
      ? await prisma.rfRaidCompletion.findMany({
          where: { userId },
          select: { characterId: true },
        })
      : [];
    const lootRows = userId
      ? await prisma.rfLoot.findMany({
          where: { userId },
          select: { characterId: true },
        })
      : [];
    const completionCountByChar = new Map<string, number>();
    for (const r of completionRows) {
      if (!r.characterId) continue;
      completionCountByChar.set(r.characterId, (completionCountByChar.get(r.characterId) ?? 0) + 1);
    }
    const lootCountByChar = new Map<string, number>();
    for (const r of lootRows) {
      if (!r.characterId) continue;
      lootCountByChar.set(r.characterId, (lootCountByChar.get(r.characterId) ?? 0) + 1);
    }

    const dashboardCharacters: DashboardCharacter[] = chars.map((c) => ({
      id: c.id,
      name: c.name,
      guildName: c.guild?.name ?? null,
      mainSpec: c.mainSpec,
      offSpec: c.offSpec,
      classId: getSpecByDisplayName(c.mainSpec)?.classId ?? null,
      participatedRaids: completionCountByChar.get(c.id) ?? 0,
      lootCount: lootCountByChar.get(c.id) ?? 0,
    }));

    const now = new Date();
    // Load a wider window so the dashboard calendar can paginate +/-7 days.
    const rangeStart = new Date(now);
    rangeStart.setDate(rangeStart.getDate() - 28);
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = new Date(now);
    rangeEnd.setDate(rangeEnd.getDate() + 28);
    rangeEnd.setHours(23, 59, 59, 999);

    const raidIdsInCalendar = raids
      .filter((r) => r.scheduledAt >= rangeStart && r.scheduledAt <= rangeEnd)
      .map((r) => r.id);

    const raidRows = raidIdsInCalendar.length
      ? await prisma.rfRaid.findMany({
          where: { id: { in: raidIdsInCalendar } },
          select: {
            id: true,
            guildId: true,
            name: true,
            scheduledAt: true,
            signupUntil: true,
            status: true,
            maxPlayers: true,
            note: true,
            guild: { select: { name: true } },
            dungeon: { select: { name: true } },
            _count: { select: { signups: true } },
            signups: userId
              ? {
                  where: { userId },
                  select: { id: true, leaderPlacement: true, setConfirmed: true },
                  take: 1,
                }
              : undefined,
          },
          orderBy: { scheduledAt: 'asc' },
        })
      : [];

    const canEditGuildIds = new Set(guilds.filter((g) => g.role === 'raidleader' || g.role === 'guildmaster').map((g) => g.id));

    const calendarRaids: DashboardCalendarRaid[] = raidRows.map((r) => ({
      id: r.id,
      guildId: r.guildId,
      guildName: r.guild.name,
      name: r.name,
      dungeonName: r.dungeon.name,
      scheduledAtIso: r.scheduledAt.toISOString(),
      signupUntilIso: r.signupUntil.toISOString(),
      status: r.status,
      signupCount: r._count.signups,
      maxPlayers: r.maxPlayers,
      hasNote: !!(r.note && r.note.trim()),
      note: (r.note && r.note.trim()) ? r.note : null,
      canEdit: canEditGuildIds.has(r.guildId),
      mySignup: (r as unknown as { signups?: { id: string; leaderPlacement: string; setConfirmed: boolean }[] }).signups?.[0] ?? null,
    }));

    // UI: "+ Neuer Raid" is shown if user can create raids (Raidleader/Gildenleiter)
    const canCreateGuildIds = guilds
      .filter((g) => g.role === 'raidleader' || g.role === 'guildmaster')
      .map((g) => g.id);

    const mySignupRows = userId
      ? await prisma.rfRaidSignup.findMany({
          where: {
            userId,
            raid: { scheduledAt: { gte: now, lte: rangeEnd } },
          },
          select: {
            raidId: true,
            type: true,
            signedSpec: true,
            leaderPlacement: true,
            setConfirmed: true,
            character: {
              select: {
                name: true,
                mainSpec: true,
                offSpec: true,
                battlenetProfile: { select: { battlenetCharacterId: true } },
              },
            },
            raid: {
              select: {
                id: true,
                name: true,
                guildId: true,
                scheduledAt: true,
                status: true,
                guild: { select: { name: true } },
                dungeon: { select: { name: true } },
              },
            },
          },
          orderBy: { raid: { scheduledAt: 'asc' } },
        })
      : [];

    const mySignups: DashboardSignupRow[] = mySignupRows.map((s) => ({
      raidId: s.raid.id,
      guildId: s.raid.guildId,
      raidName: s.raid.name,
      dungeonName: s.raid.dungeon.name,
      guildName: s.raid.guild.name,
      scheduledAtIso: s.raid.scheduledAt.toISOString(),
      signedCharacterName: s.character?.name ?? null,
      signedSpec: s.signedSpec ?? null,
      raidStatus: s.raid.status,
      leaderPlacement: s.leaderPlacement,
      setConfirmed: s.setConfirmed,
      characterMainSpec: s.character?.mainSpec ?? null,
      characterOffSpec: s.character?.offSpec ?? null,
      characterHasBattlenet: !!s.character?.battlenetProfile?.battlenetCharacterId,
      type: s.type,
    }));

    return (
      <DashboardClient
        guilds={dashboardGuilds}
        characters={dashboardCharacters}
        signups={mySignups}
        calendarRaids={calendarRaids}
        canCreateGuildIds={canCreateGuildIds}
      />
    );
  } catch (err) {
    console.error('[DashboardPage]', err);
    return (
      <div className="p-6 md:p-8">
        <p className="text-destructive">Fehler beim Laden des Dashboards. Bitte später erneut versuchen.</p>
      </div>
    );
  }
}
