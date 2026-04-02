import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRaidPlannerOrForbid } from '@/lib/raid-planner-auth';
import { userHasRaidflowParticipationInGuild } from '@/lib/guild-permissions-db';
import { syncRaidThreadSummary, postRaidLockedThreadNotice } from '@/lib/raid-thread-sync';

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
 * PATCH /api/guilds/[guildId]/raids/[raidId]
 * Raidleader: Grunddaten, Termin (optional mit Signup-Reset), absagen, setzen (locked).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string; raidId: string }> }
) {
  const { guildId, raidId } = await params;
  const auth = await requireRaidPlannerOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raid = await prisma.rfRaid.findFirst({
    where: { id: raidId, guildId },
  });
  if (!raid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const action =
    typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';

  if (action === 'cancel') {
    if (raid.status !== 'open') {
      return NextResponse.json({ error: 'Raid cannot be cancelled' }, { status: 400 });
    }
    await prisma.rfRaid.update({
      where: { id: raidId },
      data: { status: 'cancelled' },
    });
    void syncRaidThreadSummary(raidId);
    return NextResponse.json({ ok: true, status: 'cancelled' });
  }

  if (action === 'lock') {
    if (raid.status !== 'open') {
      return NextResponse.json({ error: 'Only open raids can be locked' }, { status: 400 });
    }
    await prisma.rfRaid.update({
      where: { id: raidId },
      data: { status: 'locked' },
    });
    void syncRaidThreadSummary(raidId);
    void postRaidLockedThreadNotice(raidId);
    return NextResponse.json({ ok: true, status: 'locked' });
  }

  if (raid.status !== 'open') {
    return NextResponse.json({ error: 'Raid can only be edited while open' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : raid.name;
  const note =
    typeof body.note === 'string' ? body.note.trim() || null : raid.note;
  const maxPlayers =
    typeof body.maxPlayers === 'number' && Number.isFinite(body.maxPlayers)
      ? Math.floor(body.maxPlayers)
      : raid.maxPlayers;
  const minTanks =
    typeof body.minTanks === 'number' && Number.isFinite(body.minTanks)
      ? Math.max(0, Math.floor(body.minTanks))
      : raid.minTanks;
  const minMelee =
    typeof body.minMelee === 'number' && Number.isFinite(body.minMelee)
      ? Math.max(0, Math.floor(body.minMelee))
      : raid.minMelee;
  const minRange =
    typeof body.minRange === 'number' && Number.isFinite(body.minRange)
      ? Math.max(0, Math.floor(body.minRange))
      : raid.minRange;
  const minHealers =
    typeof body.minHealers === 'number' && Number.isFinite(body.minHealers)
      ? Math.max(0, Math.floor(body.minHealers))
      : raid.minHealers;

  let nextMinSpecs: Record<string, number> | null;
  if (body.minSpecs !== undefined) {
    const p = parseMinSpecs(body.minSpecs);
    if (p === null) {
      return NextResponse.json({ error: 'Invalid minSpecs' }, { status: 400 });
    }
    nextMinSpecs = p;
  } else {
    nextMinSpecs = (raid.minSpecs as Record<string, number> | null) ?? {};
  }

  const signupVisibility =
    body.signupVisibility === 'raid_leader_only' || body.signupVisibility === 'public'
      ? body.signupVisibility
      : raid.signupVisibility;

  const raidLeaderId =
    typeof body.raidLeaderId === 'string' && body.raidLeaderId.trim()
      ? body.raidLeaderId.trim()
      : raid.raidLeaderId;
  const lootmasterId =
    typeof body.lootmasterId === 'string' && body.lootmasterId.trim()
      ? body.lootmasterId.trim()
      : raid.lootmasterId;

  const raidGroupRestrictionId =
    body.raidGroupRestrictionId === null
      ? null
      : typeof body.raidGroupRestrictionId === 'string' && body.raidGroupRestrictionId.trim()
        ? body.raidGroupRestrictionId.trim()
        : raid.raidGroupRestrictionId;
  const discordChannelId =
    body.discordChannelId === null
      ? null
      : typeof body.discordChannelId === 'string'
        ? body.discordChannelId.trim() || null
        : raid.discordChannelId;
  const discordLeaderChannelId =
    body.discordLeaderChannelId === null
      ? null
      : typeof body.discordLeaderChannelId === 'string'
        ? body.discordLeaderChannelId.trim() || null
        : raid.discordLeaderChannelId;

  const dungeonId =
    typeof body.dungeonId === 'string' && body.dungeonId.trim()
      ? body.dungeonId.trim()
      : raid.dungeonId;
  const nextDungeonIds =
    Array.isArray(body.dungeonIds) && body.dungeonIds.every((x) => typeof x === 'string')
      ? Array.from(new Set((body.dungeonIds as string[]).map((x) => x.trim()).filter(Boolean)))
      : Array.isArray(raid.dungeonIds) && raid.dungeonIds.every((x) => typeof x === 'string')
        ? Array.from(new Set((raid.dungeonIds as string[]).map((x) => x.trim()).filter(Boolean)))
        : [dungeonId];
  if (!nextDungeonIds.includes(dungeonId)) {
    nextDungeonIds.unshift(dungeonId);
  }

  const scheduledAtRaw = body.scheduledAt;
  const scheduledEndAtRaw = body.scheduledEndAt;
  const signupUntilRaw = body.signupUntil;

  let scheduledAt = raid.scheduledAt;
  let scheduledEndAt = raid.scheduledEndAt;
  let signupUntil = raid.signupUntil;

  if (scheduledAtRaw !== undefined) {
    const d =
      typeof scheduledAtRaw === 'string' || scheduledAtRaw instanceof Date
        ? new Date(scheduledAtRaw as string | Date)
        : null;
    if (!d || Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'Invalid scheduledAt' }, { status: 400 });
    }
    scheduledAt = d;
  }
  if (scheduledEndAtRaw !== undefined) {
    const d =
      typeof scheduledEndAtRaw === 'string' || scheduledEndAtRaw instanceof Date
        ? new Date(scheduledEndAtRaw as string | Date)
        : null;
    scheduledEndAt = d && !Number.isNaN(d.getTime()) ? d : null;
  }
  if (signupUntilRaw !== undefined) {
    const d =
      typeof signupUntilRaw === 'string' || signupUntilRaw instanceof Date
        ? new Date(signupUntilRaw as string | Date)
        : null;
    if (!d || Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'Invalid signupUntil' }, { status: 400 });
    }
    signupUntil = d;
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

  const confirmResetSignups = body.confirmResetSignups === true;
  const timeChanged =
    scheduledAtRaw !== undefined &&
    scheduledAt.getTime() !== raid.scheduledAt.getTime();
  const prevDungeonIds =
    Array.isArray(raid.dungeonIds) && raid.dungeonIds.every((x) => typeof x === 'string')
      ? Array.from(new Set((raid.dungeonIds as string[]).map((x) => x.trim()).filter(Boolean)))
      : [raid.dungeonId];
  const dungeonChanged =
    raid.dungeonId !== dungeonId ||
    JSON.stringify(prevDungeonIds) !== JSON.stringify(nextDungeonIds);

  if ((timeChanged || dungeonChanged) && !confirmResetSignups) {
    return NextResponse.json(
      { error: 'confirmResetSignups required when changing schedule or dungeons' },
      { status: 400 }
    );
  }

  if (!name || !Number.isFinite(maxPlayers) || maxPlayers < 1 || maxPlayers > 40) {
    return NextResponse.json({ error: 'Invalid name or maxPlayers' }, { status: 400 });
  }

  const dungeon = await prisma.rfDungeon.findFirst({
    where: { id: dungeonId, instanceType: 'raid' },
    select: { id: true },
  });
  if (!dungeon) {
    return NextResponse.json({ error: 'Dungeon not found' }, { status: 400 });
  }
  const allDungeons = await prisma.rfDungeon.findMany({
    where: { id: { in: nextDungeonIds }, instanceType: 'raid' },
    select: { id: true },
  });
  if (allDungeons.length !== nextDungeonIds.length) {
    return NextResponse.json({ error: 'One or more dungeons not found' }, { status: 400 });
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
    return userHasRaidflowParticipationInGuild(uid, guildId);
  };

  if (!(await verifyUserInGuild(raidLeaderId))) {
    return NextResponse.json({ error: 'Invalid raid leader' }, { status: 400 });
  }
  if (!(await verifyUserInGuild(lootmasterId))) {
    return NextResponse.json({ error: 'Invalid loot master' }, { status: 400 });
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

  if ((timeChanged || dungeonChanged) && confirmResetSignups) {
    await prisma.$transaction([
      prisma.rfRaidSignup.deleteMany({ where: { raidId } }),
      prisma.rfRaid.update({
        where: { id: raidId },
        data: {
          name,
          note,
          dungeonId,
          dungeonIds: nextDungeonIds,
          raidLeaderId,
          lootmasterId,
          minTanks,
          minMelee,
          minRange,
          minHealers,
          minSpecs: nextMinSpecs,
          raidGroupRestrictionId,
          discordChannelId,
          discordLeaderChannelId,
          maxPlayers,
          scheduledAt,
          scheduledEndAt,
          signupUntil,
          signupVisibility,
        },
      }),
    ]);
  } else {
    await prisma.rfRaid.update({
      where: { id: raidId },
      data: {
        name,
        note,
        dungeonId,
        dungeonIds: nextDungeonIds,
        raidLeaderId,
        lootmasterId,
        minTanks,
        minMelee,
        minRange,
        minHealers,
        minSpecs: nextMinSpecs,
        raidGroupRestrictionId,
        discordChannelId,
        discordLeaderChannelId,
        maxPlayers,
        scheduledAt,
        scheduledEndAt,
        signupUntil,
        signupVisibility,
      },
    });
  }

  void syncRaidThreadSummary(raidId);
  return NextResponse.json({
    ok: true,
    resetSignups: (timeChanged || dungeonChanged) && confirmResetSignups,
  });
}

/**
 * DELETE /api/guilds/[guildId]/raids/[raidId]
 * Raidleader/Gildenmeister: Raid vollständig löschen.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ guildId: string; raidId: string }> }
) {
  const { guildId, raidId } = await params;
  const auth = await requireRaidPlannerOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  const raid = await prisma.rfRaid.findFirst({
    where: { id: raidId, guildId },
    select: { id: true },
  });
  if (!raid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  await prisma.rfRaid.delete({
    where: { id: raidId },
  });
  return NextResponse.json({ ok: true });
}
