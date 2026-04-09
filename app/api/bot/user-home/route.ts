import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBotSecret } from '@/lib/bot-auth';
import { findManyRaidSignupsForDashboard } from '@/lib/rf-character-gear-score-compat';
import { getAppConfig } from '@/lib/app-config';

/**
 * GET /api/bot/user-home?discordUserId=...
 * Discord-Bot: App-Home-Daten analog Dashboard (Signups + anstehende Raids).
 * Auth: BOT_SETUP_SECRET.
 */
export async function GET(request: Request) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const discordUserId = searchParams.get('discordUserId')?.trim() ?? '';
  if (!discordUserId) {
    return NextResponse.json({ error: 'Missing discordUserId' }, { status: 400 });
  }

  const baseUrl =
    process.env.NEXTAUTH_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
  const locale = 'de'; // defaultLocale (siehe i18n/routing.ts)
  const now = new Date();
  const rangeEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const user = await prisma.rfUser.findUnique({
    where: { discordId: discordUserId },
    select: { id: true },
  });

  if (!user) {
    const config = await getAppConfig().catch(() => null);
    return NextResponse.json({
      linked: false,
      links: {
        dashboard: baseUrl ? `${baseUrl}/${locale}/dashboard` : null,
        profile: baseUrl ? `${baseUrl}/${locale}/profile` : null,
        newRaid: null as string | null,
      },
      emojis: config?.discordEmojis ?? {},
      stats: {
        signupCount: 0,
        confirmedCount: 0,
        reserveCount: 0,
        uncertainCount: 0,
        declinedCount: 0,
      },
      mySignups: [] as const,
      upcomingRaids: [] as const,
    });
  }

  const config = await getAppConfig().catch(() => null);
  const guildRows = await prisma.rfUserGuild.findMany({
    where: { userId: user.id },
    include: { guild: { select: { id: true, name: true } } },
    orderBy: { guild: { name: 'asc' } },
  });
  const guildIds = guildRows.map((g) => g.guild.id);
  const canEditGuildIds = new Set(
    guildRows
      .filter((g) => g.role === 'raidleader' || g.role === 'guildmaster')
      .map((g) => g.guild.id)
  );

  const mySignupRows = await findManyRaidSignupsForDashboard(user.id, now, rangeEnd);

  const raidRows =
    guildIds.length > 0
      ? await prisma.rfRaid.findMany({
          where: {
            guildId: { in: guildIds },
            scheduledAt: { gte: now, lte: rangeEnd },
          },
          include: {
            guild: { select: { name: true } },
            dungeon: { select: { name: true } },
            _count: { select: { signups: true } },
            signups: {
              where: { userId: user.id },
              select: { id: true, leaderPlacement: true, setConfirmed: true },
              take: 1,
            },
          },
          orderBy: { scheduledAt: 'asc' },
          take: 12,
        })
      : [];

  const mySignups = mySignupRows.slice(0, 12).map((s) => {
    const guildId = s.raid.guildId;
    const raidId = s.raid.id;
    const base = baseUrl ? `${baseUrl}/${locale}/guild/${encodeURIComponent(guildId)}/raid/${encodeURIComponent(raidId)}` : null;
    return {
      raidId,
      guildId,
      guildName: s.raid.guild.name,
      raidName: s.raid.name,
      dungeonName: s.raid.dungeon.name,
      scheduledAtIso: s.raid.scheduledAt.toISOString(),
      raidStatus: s.raid.status,
      type: s.type,
      leaderPlacement: s.leaderPlacement,
      setConfirmed: s.setConfirmed,
      signedCharacterName: s.character?.name ?? null,
      signedSpec: s.signedSpec ?? null,
      links: {
        view: base ? base : null,
        signup: base ? `${base}?mode=signup` : null,
      },
    };
  });

  const upcomingRaids = raidRows.map((r) => {
    const base = baseUrl
      ? `${baseUrl}/${locale}/guild/${encodeURIComponent(r.guildId)}/raid/${encodeURIComponent(r.id)}`
      : null;
    const canEdit = canEditGuildIds.has(r.guildId);
    return {
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
      canEdit,
      mySignup: r.signups?.[0] ?? null,
      links: {
        view: base ? base : null,
        signup: base ? `${base}?mode=signup` : null,
        edit: canEdit && base ? `${base}/edit` : null,
        plan: canEdit && base ? `${base}/plan` : null,
      },
    };
  });

  const typeNorm = (v: string) => (v === 'main' ? 'normal' : v);
  const signupCount = mySignupRows.length;
  const confirmedCount = mySignupRows.filter((s) => s.setConfirmed).length;
  const reserveCount = mySignupRows.filter((s) => s.leaderPlacement === 'substitute').length;
  const uncertainCount = mySignupRows.filter((s) => typeNorm(s.type) === 'uncertain').length;
  const declinedCount = mySignupRows.filter(
    (s) => !s.setConfirmed && s.leaderPlacement !== 'substitute'
  ).length;

  const canCreateGuildIds = guildRows
    .filter((g) => g.role === 'raidleader' || g.role === 'guildmaster')
    .map((g) => g.guild.id);
  const newRaidLink =
    baseUrl && canCreateGuildIds.length === 1
      ? `${baseUrl}/${locale}/guild/${encodeURIComponent(canCreateGuildIds[0])}/raid/new`
      : null;

  return NextResponse.json({
    linked: true,
    links: {
      dashboard: baseUrl ? `${baseUrl}/${locale}/dashboard` : null,
      profile: baseUrl ? `${baseUrl}/${locale}/profile` : null,
      newRaid: newRaidLink,
    },
    emojis: config?.discordEmojis ?? {},
    stats: {
      signupCount,
      confirmedCount,
      reserveCount,
      uncertainCount,
      declinedCount,
    },
    mySignups,
    upcomingRaids,
  });
}
