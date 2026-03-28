import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBotSecret } from '@/lib/bot-auth';
import {
  guildRowToPermissionSyncShape,
  syncMemberPermissionsFromDiscordState,
} from '@/lib/member-permission-sync';

/**
 * POST /api/bot/sync-member
 * Discord-Bot meldet Rollenänderungen / Join / Leave → zentrale DB-Synchronisation.
 * Auth: BOT_SETUP_SECRET (wie andere /api/bot/*).
 *
 * Body:
 * - discordGuildId, discordUserId (Snowflake-Strings)
 * - left: true → Mitglied hat den Server verlassen (bekannte Leave-Info)
 * - roleIds: string[] – Discord-Rollen-IDs (bei left ignorieren)
 * - displayName: string | null – optional Anzeigename im Server (Server-Nick o. ä.)
 */
export async function POST(request: Request) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    discordGuildId?: string;
    discordUserId?: string;
    left?: boolean;
    roleIds?: string[];
    displayName?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const discordGuildId = typeof body.discordGuildId === 'string' ? body.discordGuildId.trim() : '';
  const discordUserId = typeof body.discordUserId === 'string' ? body.discordUserId.trim() : '';
  if (!discordGuildId || !discordUserId) {
    return NextResponse.json(
      { error: 'Missing discordGuildId or discordUserId' },
      { status: 400 }
    );
  }

  const guild = await prisma.rfGuild.findUnique({
    where: { discordGuildId },
    include: {
      raidGroups: { select: { id: true, discordRoleId: true } },
    },
  });
  if (!guild) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'guild_not_registered' });
  }

  const user = await prisma.rfUser.upsert({
    where: { discordId: discordUserId },
    create: { discordId: discordUserId },
    update: { updatedAt: new Date() },
    select: { id: true },
  });

  const left = body.left === true;
  const roleIds = Array.isArray(body.roleIds)
    ? body.roleIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  const displayNameInGuild =
    body.displayName === null || body.displayName === undefined
      ? null
      : typeof body.displayName === 'string'
        ? body.displayName.trim() || null
        : null;

  try {
    if (left) {
      await syncMemberPermissionsFromDiscordState({
        userId: user.id,
        guild: guildRowToPermissionSyncShape(guild),
        membershipKnown: true,
        inGuild: false,
        roleIds: [],
        displayNameInGuild: null,
      });
    } else {
      await syncMemberPermissionsFromDiscordState({
        userId: user.id,
        guild: guildRowToPermissionSyncShape(guild),
        membershipKnown: true,
        inGuild: true,
        roleIds,
        displayNameInGuild,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[API bot/sync-member]', e);
    return NextResponse.json(
      { error: 'Sync failed', detail: process.env.NODE_ENV === 'development' ? message : undefined },
      { status: 500 }
    );
  }
}
