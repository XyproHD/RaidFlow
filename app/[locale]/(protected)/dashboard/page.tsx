import { getTranslations } from 'next-intl/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { getGuildsForUser, getRaidsForUser } from '@/lib/user-guilds';
import { getLocale } from 'next-intl/server';
import { prisma } from '@/lib/prisma';
import {
  findManyRfCharactersForDashboard,
  findManyRaidSignupsForDashboard,
} from '@/lib/rf-character-gear-score-compat';
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
      guilds = userId ? await getGuildsForUser(userId, discordId ?? null) : [];
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

    const chars = userId ? await findManyRfCharactersForDashboard(userId) : [];

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
      hasBattlenet: !!c.battlenetProfile?.battlenetCharacterId,
      gearScore: c.gearScore ?? null,
      mainSpec: c.mainSpec,
      offSpec: c.offSpec,
      classId: getSpecByDisplayName(c.mainSpec)?.classId ?? null,
      isMain: !!c.isMain,
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
            dungeonId: true,
            name: true,
            scheduledAt: true,
            signupUntil: true,
            status: true,
            maxPlayers: true,
            note: true,
            dungeonIds: true,
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
    const mySignupRows = userId ? await findManyRaidSignupsForDashboard(userId, now, rangeEnd) : [];

    const dungeonIdSet = new Set<string>();
    for (const r of raidRows) {
      const ids = Array.isArray((r as unknown as { dungeonIds?: unknown }).dungeonIds)
        ? ((r as unknown as { dungeonIds?: unknown }).dungeonIds as unknown[]).filter((x) => typeof x === 'string').map((x) => (x as string).trim())
        : [];
      dungeonIdSet.add(r.dungeonId);
      for (const id of ids) if (id) dungeonIdSet.add(id);
    }
    for (const s of mySignupRows) {
      const ids = Array.isArray((s.raid as unknown as { dungeonIds?: unknown }).dungeonIds)
        ? ((s.raid as unknown as { dungeonIds?: unknown }).dungeonIds as unknown[]).filter((x) => typeof x === 'string').map((x) => (x as string).trim())
        : [];
      dungeonIdSet.add(s.raid.dungeonId);
      for (const id of ids) if (id) dungeonIdSet.add(id);
    }
    const allDungeonIds = Array.from(dungeonIdSet);
    const dungeonNameRows = allDungeonIds.length
      ? await prisma.rfDungeonName.findMany({
          where: { dungeonId: { in: allDungeonIds }, locale },
          select: { dungeonId: true, name: true },
        })
      : [];
    const dungeonNamesById = new Map(dungeonNameRows.map((r) => [r.dungeonId, r.name]));
    const dungeonFallbackRows = allDungeonIds.length
      ? await prisma.rfDungeon.findMany({
          where: { id: { in: allDungeonIds } },
          select: { id: true, name: true },
        })
      : [];
    const dungeonFallbackById = new Map(dungeonFallbackRows.map((r) => [r.id, r.name]));

    function dungeonLabelFor(raid: { dungeonId: string; dungeon: { name: string }; dungeonIds?: unknown }) {
      const ids =
        Array.isArray(raid.dungeonIds) && raid.dungeonIds.every((x) => typeof x === 'string')
          ? (raid.dungeonIds as string[]).map((x) => x.trim()).filter(Boolean)
          : [];
      const list = Array.from(new Set([raid.dungeonId, ...ids].filter(Boolean)));
      if (list.length <= 1) return dungeonNamesById.get(raid.dungeonId) ?? raid.dungeon.name;
      return list.map((id) => dungeonNamesById.get(id) ?? dungeonFallbackById.get(id) ?? id).join(' / ');
    }

    const calendarRaids: DashboardCalendarRaid[] = raidRows.map((r) => ({
      id: r.id,
      guildId: r.guildId,
      guildName: r.guild.name,
      name: r.name,
      dungeonName: dungeonLabelFor(r),
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

    const mySignups: DashboardSignupRow[] = mySignupRows.map((s) => ({
      raidId: s.raid.id,
      guildId: s.raid.guildId,
      raidName: s.raid.name,
      dungeonName: dungeonLabelFor(s.raid as unknown as { dungeonId: string; dungeon: { name: string }; dungeonIds?: unknown }),
      guildName: s.raid.guild.name,
      scheduledAtIso: s.raid.scheduledAt.toISOString(),
      signedCharacterName: s.character?.name ?? null,
      signedCharacterId: s.character?.id ?? null,
      signedSpec: s.signedSpec ?? null,
      raidStatus: s.raid.status,
      leaderPlacement: s.leaderPlacement,
      setConfirmed: s.setConfirmed,
      characterMainSpec: s.character?.mainSpec ?? null,
      characterOffSpec: s.character?.offSpec ?? null,
      characterHasBattlenet: !!s.character?.battlenetProfile?.battlenetCharacterId,
      characterGearScore: s.character?.gearScore ?? null,
      characterIsMain: s.character?.isMain ?? null,
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
    const hint =
      process.env.NODE_ENV === 'development' && err instanceof Error ? err.message : null;
    return (
      <div className="p-6 md:p-8">
        <p className="text-destructive">Fehler beim Laden des Dashboards. Bitte später erneut versuchen.</p>
        {hint ? (
          <p className="mt-2 text-xs text-muted-foreground font-mono whitespace-pre-wrap break-words">
            {hint}
          </p>
        ) : null}
        <p className="mt-3 text-sm text-muted-foreground">
          Hinweis: Wenn kürzlich Gearscore eingeführt wurde, fehlt in der Datenbank ggf. die Spalte{' '}
          <code className="rounded bg-muted px-1">gear_score</code> — dann Migration/SQL auf der DB ausführen.
          Server-Logs (z. B. Vercel) zeigen die genaue Fehlermeldung.
        </p>
      </div>
    );
  }
}
