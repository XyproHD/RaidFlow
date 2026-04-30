import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRaidPlannerOrForbid } from '@/lib/raid-planner-auth';
import { userHasRaidflowParticipationInGuild } from '@/lib/guild-permissions-db';
import { channelExists } from '@/lib/discord-guild-api';
import { syncRaidThreadSummary } from '@/lib/raid-thread-sync';
import { parseMinSpecsPayload } from '@/lib/min-spec-keys';

/**
 * POST /api/guilds/[guildId]/raids
 * Legt einen neuen Raid an (Status open). Optional: Discord-Thread im erlaubten Channel.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const { guildId } = await params;
  const auth = await requireRaidPlannerOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const dungeonIdRaw = typeof body.dungeonId === 'string' ? body.dungeonId.trim() : '';
  const dungeonIdsRaw = Array.isArray(body.dungeonIds)
    ? (body.dungeonIds as unknown[]).filter((x) => typeof x === 'string').map((x) => (x as string).trim())
    : null;
  const dungeonIds = dungeonIdsRaw ? dungeonIdsRaw.filter(Boolean) : [];
  const dungeonId = (dungeonIds[0] ?? dungeonIdRaw).trim();
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const note = typeof body.note === 'string' ? body.note.trim() : null;
  const maxPlayers =
    typeof body.maxPlayers === 'number' && Number.isFinite(body.maxPlayers)
      ? Math.floor(body.maxPlayers)
      : NaN;
  const minTanks =
    typeof body.minTanks === 'number' && Number.isFinite(body.minTanks)
      ? Math.max(0, Math.floor(body.minTanks))
      : NaN;
  const minMelee =
    typeof body.minMelee === 'number' && Number.isFinite(body.minMelee)
      ? Math.max(0, Math.floor(body.minMelee))
      : NaN;
  const minRange =
    typeof body.minRange === 'number' && Number.isFinite(body.minRange)
      ? Math.max(0, Math.floor(body.minRange))
      : NaN;
  const minHealers =
    typeof body.minHealers === 'number' && Number.isFinite(body.minHealers)
      ? Math.max(0, Math.floor(body.minHealers))
      : NaN;

  const scheduledAtRaw = body.scheduledAt;
  const scheduledEndAtRaw = body.scheduledEndAt;
  const signupUntilRaw = body.signupUntil;
  const scheduledAt =
    typeof scheduledAtRaw === 'string' || scheduledAtRaw instanceof Date
      ? new Date(scheduledAtRaw as string | Date)
      : null;
  let scheduledEndAt: Date | null =
    typeof scheduledEndAtRaw === 'string' || scheduledEndAtRaw instanceof Date
      ? new Date(scheduledEndAtRaw as string | Date)
      : null;
  const signupUntil =
    typeof signupUntilRaw === 'string' || signupUntilRaw instanceof Date
      ? new Date(signupUntilRaw as string | Date)
      : null;

  const signupVisibility =
    body.signupVisibility === 'raid_leader_only' ? 'raid_leader_only' : 'public';

  const raidLeaderId =
    typeof body.raidLeaderId === 'string' && body.raidLeaderId.trim()
      ? body.raidLeaderId.trim()
      : null;
  const lootmasterId =
    typeof body.lootmasterId === 'string' && body.lootmasterId.trim()
      ? body.lootmasterId.trim()
      : null;

  const organizerDiscordIdRaw = body.organizerDiscordId;
  const organizerDiscordId =
    organizerDiscordIdRaw === null || organizerDiscordIdRaw === ''
      ? null
      : typeof organizerDiscordIdRaw === 'string' && organizerDiscordIdRaw.trim()
        ? organizerDiscordIdRaw.trim()
        : null;

  const raidGroupRestrictionId =
    typeof body.raidGroupRestrictionId === 'string' && body.raidGroupRestrictionId.trim()
      ? body.raidGroupRestrictionId.trim()
      : null;

  const discordChannelId =
    typeof body.discordChannelId === 'string' && body.discordChannelId.trim()
      ? body.discordChannelId.trim()
      : null;

  const discordLeaderChannelId =
    typeof body.discordLeaderChannelId === 'string' && body.discordLeaderChannelId.trim()
      ? body.discordLeaderChannelId.trim()
      : null;

  /** Thread wird angelegt, sobald ein Raid-Thread-Kanal gewählt ist (kein separater Schalter). */
  const createDiscordThread = !!discordChannelId;

  const minSpecsParsed = parseMinSpecsPayload(body.minSpecs);
  if (minSpecsParsed === null) {
    return NextResponse.json({ error: 'Invalid minSpecs' }, { status: 400 });
  }

  if (!dungeonId || !name) {
    return NextResponse.json(
      { error: 'Missing dungeonId or name' },
      { status: 400 }
    );
  }
  if (!Number.isFinite(maxPlayers) || maxPlayers < 1 || maxPlayers > 40) {
    return NextResponse.json({ error: 'Invalid maxPlayers' }, { status: 400 });
  }
  if ([minTanks, minMelee, minRange, minHealers].some((n) => !Number.isFinite(n))) {
    return NextResponse.json({ error: 'Invalid minimum role counts' }, { status: 400 });
  }
  if (!scheduledAt || Number.isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: 'Invalid scheduledAt' }, { status: 400 });
  }
  if (scheduledEndAt && Number.isNaN(scheduledEndAt.getTime())) {
    return NextResponse.json({ error: 'Invalid scheduledEndAt' }, { status: 400 });
  }
  if (!scheduledEndAt || Number.isNaN(scheduledEndAt.getTime())) {
    scheduledEndAt = new Date(scheduledAt.getTime() + 30 * 60 * 1000);
  }
  if (scheduledEndAt.getTime() <= scheduledAt.getTime()) {
    return NextResponse.json(
      { error: 'scheduledEndAt must be after scheduledAt' },
      { status: 400 }
    );
  }
  if (!signupUntil || Number.isNaN(signupUntil.getTime())) {
    return NextResponse.json({ error: 'Invalid signupUntil' }, { status: 400 });
  }

  const uniqueDungeonIds = Array.from(new Set([dungeonId, ...dungeonIds].filter(Boolean)));
  const dungeons = await prisma.rfDungeon.findMany({
    where: { id: { in: uniqueDungeonIds }, instanceType: 'raid' },
    select: { id: true, name: true },
  });
  if (!dungeons.some((d) => d.id === dungeonId)) {
    return NextResponse.json({ error: 'Dungeon not found' }, { status: 400 });
  }
  if (uniqueDungeonIds.length > 0 && dungeons.length !== uniqueDungeonIds.length) {
    return NextResponse.json({ error: 'One or more dungeons not found' }, { status: 400 });
  }
  const primaryDungeon = dungeons.find((d) => d.id === dungeonId)!;

  if (raidGroupRestrictionId) {
    const rg = await prisma.rfRaidGroup.findFirst({
      where: { id: raidGroupRestrictionId, guildId },
    });
    if (!rg) {
      return NextResponse.json(
        { error: 'Raid group restriction not found for this guild' },
        { status: 400 }
      );
    }
  }

  const verifyUserInGuild = async (uid: string | null) => {
    if (!uid) return true;
    return userHasRaidflowParticipationInGuild(uid, guildId);
  };

  if (!(await verifyUserInGuild(raidLeaderId))) {
    return NextResponse.json({ error: 'Invalid raid leader' }, { status: 400 });
  }
  if (!(await verifyUserInGuild(lootmasterId))) {
    return NextResponse.json({ error: 'Invalid loot master' }, { status: 400 });
  }

  if (organizerDiscordId) {
    const orgUser = await prisma.rfUser.findUnique({
      where: { discordId: organizerDiscordId },
      select: { id: true },
    });
    if (!orgUser) {
      return NextResponse.json({ error: 'Invalid organizer (unknown Discord user)' }, { status: 400 });
    }
    if (!(await verifyUserInGuild(orgUser.id))) {
      return NextResponse.json(
        { error: 'Organizer must be a raid-eligible guild participant' },
        { status: 400 }
      );
    }
  }

  if (discordLeaderChannelId) {
    const allowedLeader = await prisma.rfGuildAllowedChannel.findFirst({
      where: { guildId, discordChannelId: discordLeaderChannelId },
    });
    if (!allowedLeader) {
      return NextResponse.json(
        { error: 'Leader channel is not in the guild allowed list' },
        { status: 400 }
      );
    }
  }

  if (createDiscordThread) {
    const allowed = await prisma.rfGuildAllowedChannel.findFirst({
      where: { guildId, discordChannelId },
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Channel is not in the guild allowed list' },
        { status: 400 }
      );
    }
    const exists = await channelExists(discordChannelId!);
    if (!exists) {
      await prisma.rfGuildAllowedChannel.deleteMany({
        where: { guildId, discordChannelId: discordChannelId! },
      });
      return NextResponse.json(
        { error: 'Discord channel no longer exists' },
        { status: 400 }
      );
    }
  }

  const raid = await prisma.rfRaid.create({
    data: {
      guildId,
      dungeonId,
      dungeonIds: uniqueDungeonIds.length > 1 ? uniqueDungeonIds : undefined,
      name,
      raidLeaderId,
      lootmasterId,
      organizerDiscordId,
      minTanks,
      minMelee,
      minRange,
      minHealers,
      minSpecs: minSpecsParsed,
      raidGroupRestrictionId,
      note,
      maxPlayers,
      scheduledAt,
      scheduledEndAt,
      signupUntil,
      signupVisibility,
      status: 'open',
      discordThreadId: null,
      discordChannelId: null,
      discordLeaderChannelId,
    },
  });

  let discordThreadWarning: string | undefined;

  if (createDiscordThread && discordChannelId) {
    // discordChannelId auf dem Raid speichern, damit syncRaidThreadSummary den Channel kennt
    await prisma.rfRaid.update({
      where: { id: raid.id },
      data:  { discordChannelId },
    });
    try {
      // syncRaidThreadSummary postet Embed in Channel + erstellt Thread + speichert IDs
      await syncRaidThreadSummary(raid.id);
    } catch (e) {
      console.error('[POST raids] Discord post failed:', e);
      discordThreadWarning = 'discord_post_failed';
    }
  }

  const updatedRaid = await prisma.rfRaid.findUnique({
    where:  { id: raid.id },
    select: { id: true, guildId: true, status: true, discordChannelId: true, discordThreadId: true, discordChannelMessageId: true },
  });

  return NextResponse.json({
    raid: {
      id:                    updatedRaid?.id ?? raid.id,
      guildId:               updatedRaid?.guildId ?? raid.guildId,
      status:                updatedRaid?.status ?? raid.status,
      discordChannelId:      updatedRaid?.discordChannelId ?? null,
      discordThreadId:       updatedRaid?.discordThreadId ?? null,
      discordChannelMessageId: updatedRaid?.discordChannelMessageId ?? null,
    },
    ...(discordThreadWarning ? { warning: discordThreadWarning } : {}),
  });
}
