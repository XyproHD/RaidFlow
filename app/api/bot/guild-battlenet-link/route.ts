/**
 * Battle.net-Gildenverknüpfung für den Discord-Bot (analog Gildenverwaltung → Battle.net).
 * Auth: BOT_SETUP_SECRET. Identifikation über discordGuildId (Snowflake).
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyBotSecret } from '@/lib/bot-auth';
import { prisma } from '@/lib/prisma';

export async function GET(request: NextRequest) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const discordGuildId = request.nextUrl.searchParams.get('discordGuildId')?.trim();
  if (!discordGuildId) {
    return NextResponse.json({ error: 'Missing discordGuildId' }, { status: 400 });
  }

  try {
    const guild = await prisma.rfGuild.findUnique({
      where: { discordGuildId },
      select: {
        id: true,
        name: true,
        discordRoleGuildmasterId: true,
        discordRoleRaidleaderId: true,
        discordRoleRaiderId: true,
        battlenetRealmId: true,
        battlenetProfileRealmSlug: true,
        battlenetProfileRealmId: true,
        battlenetGuildId: true,
        battlenetGuildName: true,
      },
    });
    if (!guild) {
      return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
    }

    const rolesConfigured = Boolean(
      guild.discordRoleGuildmasterId &&
        guild.discordRoleRaidleaderId &&
        guild.discordRoleRaiderId
    );

    return NextResponse.json({
      guildId: guild.id,
      discordGuildName: guild.name,
      rolesConfigured,
      battlenetRealmId: guild.battlenetRealmId,
      battlenetProfileRealmSlug: guild.battlenetProfileRealmSlug,
      battlenetProfileRealmId: guild.battlenetProfileRealmId?.toString() ?? null,
      battlenetGuildId: guild.battlenetGuildId?.toString() ?? null,
      battlenetGuildName: guild.battlenetGuildName,
    });
  } catch (e) {
    console.error('[bot/guild-battlenet-link GET]', e);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    discordGuildId?: string;
    action?: string;
    battlenetRealmId?: string | null;
    battlenetGuildId?: string | null;
    battlenetGuildName?: string | null;
    profileRealmSlug?: string | null;
    profileRealmId?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const discordGuildId = typeof body.discordGuildId === 'string' ? body.discordGuildId.trim() : '';
  if (!discordGuildId) {
    return NextResponse.json({ error: 'discordGuildId is required' }, { status: 400 });
  }

  const rfGuild = await prisma.rfGuild.findUnique({
    where: { discordGuildId },
    select: {
      id: true,
      discordRoleGuildmasterId: true,
      discordRoleRaidleaderId: true,
      discordRoleRaiderId: true,
    },
  });
  if (!rfGuild) {
    return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
  }
  const rolesOk =
    rfGuild.discordRoleGuildmasterId &&
    rfGuild.discordRoleRaidleaderId &&
    rfGuild.discordRoleRaiderId;
  if (!rolesOk) {
    return NextResponse.json(
      { error: 'RaidFlow-Discord-Rollen sind noch nicht vollständig konfiguriert.' },
      { status: 409 }
    );
  }

  const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';

  if (action === 'clear') {
    try {
      const updated = await prisma.rfGuild.update({
        where: { id: rfGuild.id },
        data: {
          battlenetRealmId: null,
          battlenetProfileRealmSlug: null,
          battlenetProfileRealmId: null,
          battlenetGuildId: null,
          battlenetGuildName: null,
        },
        select: {
          battlenetRealmId: true,
          battlenetProfileRealmSlug: true,
          battlenetProfileRealmId: true,
          battlenetGuildId: true,
          battlenetGuildName: true,
        },
      });
      return NextResponse.json({
        ok: true,
        battlenetRealmId: updated.battlenetRealmId,
        battlenetProfileRealmSlug: null,
        battlenetProfileRealmId: null,
        battlenetGuildId: null,
        battlenetGuildName: null,
      });
    } catch (e) {
      console.error('[bot/guild-battlenet-link POST clear]', e);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }
  }

  if (action !== 'save') {
    return NextResponse.json({ error: "action must be 'save' or 'clear'" }, { status: 400 });
  }

  const realmId = typeof body.battlenetRealmId === 'string' ? body.battlenetRealmId.trim() : '';
  if (!realmId) {
    return NextResponse.json({ error: 'battlenetRealmId is required' }, { status: 400 });
  }

  const realmRow = await prisma.rfBattlenetRealm.findUnique({
    where: { id: realmId },
    select: { id: true, slug: true, realmId: true },
  });
  if (!realmRow) {
    return NextResponse.json({ error: 'Realm not found' }, { status: 400 });
  }

  let guildIdBn: bigint;
  try {
    const raw = String(body.battlenetGuildId ?? '').trim();
    if (!raw) {
      return NextResponse.json({ error: 'battlenetGuildId is required' }, { status: 400 });
    }
    guildIdBn = BigInt(raw);
  } catch {
    return NextResponse.json({ error: 'Invalid battlenetGuildId' }, { status: 400 });
  }

  const guildNameBn =
    typeof body.battlenetGuildName === 'string' ? body.battlenetGuildName.trim() : '';
  if (!guildNameBn) {
    return NextResponse.json({ error: 'battlenetGuildName is required' }, { status: 400 });
  }

  const slugFromBody =
    typeof body.profileRealmSlug === 'string' ? body.profileRealmSlug.trim() : '';
  const profileRealmSlug = slugFromBody || realmRow.slug;

  let profileRealmNumeric: bigint | null = null;
  if (body.profileRealmId !== undefined && body.profileRealmId !== null && body.profileRealmId !== '') {
    try {
      profileRealmNumeric = BigInt(String(body.profileRealmId).trim());
    } catch {
      return NextResponse.json({ error: 'Invalid profileRealmId' }, { status: 400 });
    }
  } else {
    profileRealmNumeric = realmRow.realmId;
  }

  try {
    const updated = await prisma.rfGuild.update({
      where: { id: rfGuild.id },
      data: {
        battlenetRealmId: realmId,
        battlenetProfileRealmSlug: profileRealmSlug || null,
        battlenetProfileRealmId: profileRealmNumeric,
        battlenetGuildId: guildIdBn,
        battlenetGuildName: guildNameBn,
      },
      select: {
        battlenetRealmId: true,
        battlenetProfileRealmSlug: true,
        battlenetProfileRealmId: true,
        battlenetGuildId: true,
        battlenetGuildName: true,
      },
    });

    return NextResponse.json({
      ok: true,
      battlenetRealmId: updated.battlenetRealmId,
      battlenetProfileRealmSlug: updated.battlenetProfileRealmSlug,
      battlenetProfileRealmId: updated.battlenetProfileRealmId?.toString() ?? null,
      battlenetGuildId: updated.battlenetGuildId?.toString() ?? null,
      battlenetGuildName: updated.battlenetGuildName,
    });
  } catch (e) {
    console.error('[bot/guild-battlenet-link POST save]', e);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
