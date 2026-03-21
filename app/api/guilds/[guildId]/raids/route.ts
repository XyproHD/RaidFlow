import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRaidPlannerOrForbid } from '@/lib/raid-planner-auth';
import { channelExists, createPublicThreadInChannel } from '@/lib/discord-guild-api';

function parseMinSpecs(raw: unknown): Record<string, number> | null {
  if (raw == null) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 99) return null;
    if (k.trim().length === 0) return null;
    out[k.trim()] = Math.floor(v);
  }
  return out;
}

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

  const dungeonId = typeof body.dungeonId === 'string' ? body.dungeonId.trim() : '';
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
  const signupUntilRaw = body.signupUntil;
  const scheduledAt =
    typeof scheduledAtRaw === 'string' || scheduledAtRaw instanceof Date
      ? new Date(scheduledAtRaw as string | Date)
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

  const raidGroupRestrictionId =
    typeof body.raidGroupRestrictionId === 'string' && body.raidGroupRestrictionId.trim()
      ? body.raidGroupRestrictionId.trim()
      : null;

  const discordChannelId =
    typeof body.discordChannelId === 'string' && body.discordChannelId.trim()
      ? body.discordChannelId.trim()
      : null;

  const createDiscordThread = body.createDiscordThread === true;

  const minSpecsParsed = parseMinSpecs(body.minSpecs);
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
  if (!signupUntil || Number.isNaN(signupUntil.getTime())) {
    return NextResponse.json({ error: 'Invalid signupUntil' }, { status: 400 });
  }

  const dungeon = await prisma.rfDungeon.findFirst({
    where: { id: dungeonId, instanceType: 'raid' },
    select: { id: true, name: true },
  });
  if (!dungeon) {
    return NextResponse.json({ error: 'Dungeon not found' }, { status: 400 });
  }

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
    const ug = await prisma.rfUserGuild.findUnique({
      where: { userId_guildId: { userId: uid, guildId } },
    });
    return !!(ug && ug.role !== 'member');
  };

  if (!(await verifyUserInGuild(raidLeaderId))) {
    return NextResponse.json({ error: 'Invalid raid leader' }, { status: 400 });
  }
  if (!(await verifyUserInGuild(lootmasterId))) {
    return NextResponse.json({ error: 'Invalid loot master' }, { status: 400 });
  }

  if (createDiscordThread) {
    if (!discordChannelId) {
      return NextResponse.json(
        { error: 'discordChannelId required when createDiscordThread is true' },
        { status: 400 }
      );
    }
    const allowed = await prisma.rfGuildAllowedChannel.findFirst({
      where: { guildId, discordChannelId },
    });
    if (!allowed) {
      return NextResponse.json(
        { error: 'Channel is not in the guild allowed list' },
        { status: 400 }
      );
    }
    const exists = await channelExists(discordChannelId);
    if (!exists) {
      await prisma.rfGuildAllowedChannel.deleteMany({
        where: { guildId, discordChannelId },
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
      name,
      raidLeaderId,
      lootmasterId,
      minTanks,
      minMelee,
      minRange,
      minHealers,
      minSpecs: minSpecsParsed,
      raidGroupRestrictionId,
      note,
      maxPlayers,
      scheduledAt,
      signupUntil,
      signupVisibility,
      status: 'open',
      discordThreadId: null,
      discordChannelId: null,
    },
  });

  let discordThreadId: string | null = null;
  let storedChannelId: string | null = null;
  let threadWarning: string | undefined;

  if (createDiscordThread && discordChannelId) {
    const threadTitle = `${dungeon.name} – ${name}`.slice(0, 100);
    try {
      const { threadId } = await createPublicThreadInChannel(discordChannelId, threadTitle);
      discordThreadId = threadId;
      storedChannelId = discordChannelId;
      await prisma.rfRaid.update({
        where: { id: raid.id },
        data: {
          discordThreadId,
          discordChannelId: storedChannelId,
        },
      });
    } catch (e) {
      console.error('[POST raids] Discord thread failed:', e);
      threadWarning = 'thread_failed';
    }
  }

  return NextResponse.json({
    raid: {
      id: raid.id,
      guildId: raid.guildId,
      status: raid.status,
      discordThreadId,
      discordChannelId: storedChannelId,
    },
    ...(threadWarning ? { warning: threadWarning } : {}),
  });
}
