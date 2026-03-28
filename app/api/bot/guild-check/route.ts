import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBotSecret } from '@/lib/bot-auth';
import { getAppConfig, isGuildAllowed } from '@/lib/app-config';
import {
  logBotDiagnosticConsole,
  persistBotDiagnosticLog,
} from '@/lib/bot-diagnostic-log';

/**
 * GET /api/bot/guild-check?discordGuildId=...&discordUserId=...
 * Discord-Bot: Diagnose Gilde in DB + User-Zuordnung (keine Discord-REST-Seite hier).
 * Auth: BOT_SETUP_SECRET (Authorization: Bearer …).
 */
export async function GET(request: Request) {
  const started = Date.now();
  if (!verifyBotSecret(request)) {
    logBotDiagnosticConsole('guild-check', { step: 'auth', ok: false, reason: 'unauthorized' });
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const discordGuildId = searchParams.get('discordGuildId')?.trim() ?? '';
  const discordUserId = searchParams.get('discordUserId')?.trim() ?? '';
  if (!discordGuildId || !discordUserId) {
    return NextResponse.json(
      { error: 'Missing discordGuildId or discordUserId' },
      { status: 400 }
    );
  }

  logBotDiagnosticConsole('guild-check', {
    step: 'start',
    discordGuildId,
    discordUserId,
  });

  const config = await getAppConfig();
  const allowedByConfig = isGuildAllowed(discordGuildId, config);

  const guild = await prisma.rfGuild.findUnique({
    where: { discordGuildId },
    include: {
      _count: { select: { raidGroups: true } },
    },
  });

  const minimumRolesConfigured = !!(
    guild?.discordRoleGuildmasterId &&
    guild?.discordRoleRaidleaderId &&
    guild?.discordRoleRaiderId
  );

  const rfUser = await prisma.rfUser.findUnique({
    where: { discordId: discordUserId },
    select: { id: true },
  });

  let rfUserGuildRole: string | null = null;
  let rfGuildMemberExists = false;
  let raidGroupLinkCount = 0;

  if (rfUser && guild) {
    const ug = await prisma.rfUserGuild.findUnique({
      where: { userId_guildId: { userId: rfUser.id, guildId: guild.id } },
      select: { role: true },
    });
    rfUserGuildRole = ug?.role ?? null;

    const gm = await prisma.rfGuildMember.findUnique({
      where: { userId_guildId: { userId: rfUser.id, guildId: guild.id } },
      include: { _count: { select: { memberRaidGroups: true } } },
    });
    rfGuildMemberExists = !!gm;
    raidGroupLinkCount = gm?._count.memberRaidGroups ?? 0;
  }

  const hints: string[] = [];
  if (!allowedByConfig) {
    if (config.useWhitelist) {
      hints.push('Server steht nicht auf der App-Whitelist (rf_app_config).');
    }
    if (config.useBlacklist) {
      hints.push('Server steht auf der App-Blacklist.');
    }
  }
  if (!guild) {
    hints.push('Gilde nicht in der Datenbank – zuerst /raidflow setup auf diesem Server ausführen.');
  } else if (!minimumRolesConfigured) {
    hints.push('Mindestrollen in der DB unvollständig – Setup erneut abschließen.');
  }
  if (!rfUser) {
    hints.push('Discord-User noch nicht in rf_user – mindestens einmal in der Webapp mit Discord anmelden.');
  } else if (guild && !rfUserGuildRole) {
    hints.push('Kein rf_user_guild-Eintrag – Webapp-Dashboard laden (mit DISCORD_BOT_TOKEN) oder Bot Member-Sync (Intent) nutzen.');
  }

  const payload = {
    ok: true,
    durationMs: Date.now() - started,
    allowedByAppConfig: allowedByConfig,
    guildInDatabase: !!guild,
    rfGuild: guild
      ? {
          id: guild.id,
          name: guild.name,
          discordGuildId: guild.discordGuildId,
          discordRoleGuildmasterId: guild.discordRoleGuildmasterId,
          discordRoleRaidleaderId: guild.discordRoleRaidleaderId,
          discordRoleRaiderId: guild.discordRoleRaiderId,
          raidGroupCount: guild._count.raidGroups,
          minimumRolesConfigured,
        }
      : null,
    user: {
      discordUserId,
      rfUserExists: !!rfUser,
      rfUserId: rfUser?.id ?? null,
      rfUserGuildRole,
      rfGuildMemberExists,
      raidGroupLinkCount,
    },
    hints,
  };

  const summaryLine = guild
    ? `guild=${guild.name} minRoles=${minimumRolesConfigured} userGuild=${rfUserGuildRole ?? 'none'}`
    : 'guild=missing';

  logBotDiagnosticConsole('guild-check', {
    step: 'done',
    discordGuildId,
    discordUserId,
    ...payload,
  });

  void persistBotDiagnosticLog({
    kind: 'guild_member_check',
    discordGuildId,
    discordUserId,
    success: true,
    summaryLine,
    payload: payload as Record<string, unknown>,
  });

  return NextResponse.json(payload);
}
