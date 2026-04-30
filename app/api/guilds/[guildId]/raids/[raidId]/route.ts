import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRaidPlannerOrForbid } from '@/lib/raid-planner-auth';
import { userHasRaidflowParticipationInGuild } from '@/lib/guild-permissions-db';
import { syncRaidThreadSummary, postRaidLockedThreadNotice } from '@/lib/raid-thread-sync';
import { parseMinSpecsPayload } from '@/lib/min-spec-keys';
import {
  announceLayoutToStoredJson,
  executeRaidAnnounceTransaction,
  parseAnnounceRaidPayload,
  validateAnnouncePayloadAgainstKnownIds,
} from '@/lib/raid-announce';

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
    if (raid.status !== 'open' && raid.status !== 'announced') {
      return NextResponse.json({ error: 'Raid cannot be cancelled' }, { status: 400 });
    }
    await prisma.rfRaid.update({
      where: { id: raidId },
      data: { status: 'cancelled' },
    });
    await syncRaidThreadSummary(raidId);
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
    await syncRaidThreadSummary(raidId);
    await postRaidLockedThreadNotice(raidId);
    return NextResponse.json({ ok: true, status: 'locked' });
  }

  if (action === 'announce') {
    if (raid.status !== 'open') {
      return NextResponse.json({ error: 'Only open raids can be announced' }, { status: 400 });
    }
    const parsed = parseAnnounceRaidPayload(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }
    const exec = await executeRaidAnnounceTransaction({
      prisma,
      raidId,
      guildId,
      changedByUserId: auth.userId,
      payload: parsed.data,
    });
    if (!exec.ok) {
      return NextResponse.json({ error: exec.error }, { status: exec.status });
    }
    await syncRaidThreadSummary(raidId);
    return NextResponse.json({ ok: true, status: 'announced' });
  }

  if (raid.status !== 'open' && raid.status !== 'announced') {
    return NextResponse.json(
      { error: 'Raid can only be edited while open or announced' },
      { status: 400 }
    );
  }

  const name = typeof body.name === 'string' ? body.name.trim() : raid.name;
  const note =
    typeof body.note === 'string' ? body.note.trim() || null : raid.note;
  const plannerLeaderNotesHtml =
    body.plannerLeaderNotesHtml !== undefined
      ? typeof body.plannerLeaderNotesHtml === 'string'
        ? body.plannerLeaderNotesHtml.trim() || null
        : raid.plannerLeaderNotesHtml
      : raid.plannerLeaderNotesHtml;
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
    const p = parseMinSpecsPayload(body.minSpecs);
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

  let organizerDiscordId: string | null | undefined = undefined;
  if ('organizerDiscordId' in body) {
    const raw = body.organizerDiscordId;
    if (raw === null || raw === '') {
      organizerDiscordId = null;
    } else if (typeof raw === 'string' && raw.trim()) {
      organizerDiscordId = raw.trim();
    } else if (raw !== undefined) {
      return NextResponse.json({ error: 'Invalid organizerDiscordId' }, { status: 400 });
    }
  }

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

  const resetSignups = (timeChanged || dungeonChanged) && confirmResetSignups;

  let announcedPlannerGroupsJsonUpdate:
    | Prisma.InputJsonValue
    | Prisma.NullableJsonNullValueInput
    | undefined = undefined;
  if (resetSignups && raid.status === 'announced') {
    announcedPlannerGroupsJsonUpdate = Prisma.DbNull;
  } else if (
    !resetSignups &&
    raid.status === 'announced' &&
    body.announcedPlannerGroupsJson !== undefined
  ) {
    const raw = body.announcedPlannerGroupsJson;
    if (raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
      return NextResponse.json({ error: 'Invalid announcedPlannerGroupsJson' }, { status: 400 });
    }
    if (raw !== null) {
      const parsed = parseAnnounceRaidPayload(raw as Record<string, unknown>);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: parsed.status });
      }
      const knownRows = await prisma.rfRaidSignup.findMany({
        where: { raidId },
        select: { id: true },
      });
      const known = new Set(knownRows.map((r) => r.id));
      const idCheck = validateAnnouncePayloadAgainstKnownIds(parsed.data, known);
      if (!idCheck.ok) {
        return NextResponse.json({ error: idCheck.error }, { status: idCheck.status });
      }
      announcedPlannerGroupsJsonUpdate = announceLayoutToStoredJson(parsed.data);
    }
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

  if (organizerDiscordId !== undefined && organizerDiscordId !== null) {
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

  const raidUpdateData = {
    name,
    note,
    plannerLeaderNotesHtml,
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
    ...(organizerDiscordId !== undefined ? { organizerDiscordId } : {}),
    maxPlayers,
    scheduledAt,
    scheduledEndAt,
    signupUntil,
    signupVisibility,
    ...(announcedPlannerGroupsJsonUpdate !== undefined
      ? { announcedPlannerGroupsJson: announcedPlannerGroupsJsonUpdate }
      : {}),
  };

  if (resetSignups) {
    await prisma.$transaction([
      prisma.rfRaidSignup.deleteMany({ where: { raidId } }),
      prisma.rfRaid.update({
        where: { id: raidId },
        data: raidUpdateData,
      }),
    ]);
  } else {
    await prisma.rfRaid.update({
      where: { id: raidId },
      data: raidUpdateData,
    });
  }

  await syncRaidThreadSummary(raidId);
  return NextResponse.json({
    ok: true,
    resetSignups,
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
    select: {
      id: true,
      discordChannelId: true,
      discordChannelMessageId: true,
    },
  });
  if (!raid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (raid.discordChannelId && raid.discordChannelMessageId) {
    try {
      const { deleteChannelMessage } = await import('@/lib/discord-guild-api');
      await deleteChannelMessage(raid.discordChannelId, raid.discordChannelMessageId);
    } catch (e) {
      console.error('[DELETE raid] Discord message delete failed:', e);
    }
  }

  await prisma.rfRaid.delete({
    where: { id: raidId },
  });
  return NextResponse.json({ ok: true });
}
