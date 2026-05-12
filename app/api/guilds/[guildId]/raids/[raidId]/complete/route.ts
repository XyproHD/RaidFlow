import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRaidPlannerOrForbid } from '@/lib/raid-planner-auth';
import { normalizeParticipationWeight } from '@/lib/raid-participation-weight';

type EntryIn = { signupId?: unknown; weight?: unknown };

/**
 * POST …/complete
 * Raidleitung: Teilnahmegewichte pro Anmeldung speichern, Raid als abgeschlossen markieren, Discord-Post entfernen.
 */
export async function POST(
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

  const entriesRaw = body.entries;
  if (!Array.isArray(entriesRaw)) {
    return NextResponse.json({ error: 'entries must be an array' }, { status: 400 });
  }

  const weightBySignupId = new Map<string, number>();
  for (const row of entriesRaw as EntryIn[]) {
    const signupId = typeof row.signupId === 'string' ? row.signupId.trim() : '';
    if (!signupId) continue;
    const w = normalizeParticipationWeight(row.weight);
    if (w === null) {
      return NextResponse.json({ error: 'Invalid weight for signup ' + signupId }, { status: 400 });
    }
    weightBySignupId.set(signupId, w);
  }

  const raid = await prisma.rfRaid.findFirst({
    where: { id: raidId, guildId },
    select: {
      id: true,
      status: true,
      discordChannelId: true,
      discordChannelMessageId: true,
    },
  });
  if (!raid) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (raid.status === 'completed') {
    return NextResponse.json({ error: 'Raid is already completed' }, { status: 400 });
  }
  if (raid.status === 'cancelled') {
    return NextResponse.json({ error: 'Cancelled raid cannot be completed' }, { status: 400 });
  }
  if (raid.status !== 'open' && raid.status !== 'announced' && raid.status !== 'locked') {
    return NextResponse.json({ error: 'Raid cannot be completed in this state' }, { status: 400 });
  }

  let signups: { id: string; userId: string; characterId: string | null }[] = [];
  if (weightBySignupId.size > 0) {
    const signupIds = Array.from(weightBySignupId.keys());
    signups = await prisma.rfRaidSignup.findMany({
      where: { raidId, id: { in: signupIds } },
      select: { id: true, userId: true, characterId: true },
    });
    if (signups.length !== signupIds.length) {
      return NextResponse.json({ error: 'Unknown or invalid signup id' }, { status: 400 });
    }
    if (signups.some((s) => !s.characterId)) {
      return NextResponse.json(
        { error: 'Every signup for completion must have a character' },
        { status: 400 }
      );
    }
  }

  const completionRows: Prisma.RfRaidCompletionCreateManyInput[] = [];
  for (const s of signups) {
    const w = weightBySignupId.get(s.id)!;
    if (w <= 0) continue;
    completionRows.push({
      raidId,
      userId: s.userId,
      characterId: s.characterId,
      participationCounter: new Prisma.Decimal(String(w)),
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.rfRaidCompletion.deleteMany({ where: { raidId } });
    if (completionRows.length > 0) {
      await tx.rfRaidCompletion.createMany({ data: completionRows });
    }
    await tx.rfRaid.update({
      where: { id: raidId },
      data: { status: 'completed' },
    });
  });

  if (raid.discordChannelId && raid.discordChannelMessageId) {
    try {
      const { deleteChannelMessage } = await import('@/lib/discord-guild-api');
      await deleteChannelMessage(raid.discordChannelId, raid.discordChannelMessageId);
    } catch (e) {
      console.error('[POST raid complete] Discord message delete failed:', e);
    }
    try {
      await prisma.rfRaid.update({
        where: { id: raidId },
        data: { discordChannelMessageId: null, discordThreadId: null },
      });
    } catch (e) {
      console.error('[POST raid complete] clear discord ids failed:', e);
    }
  }

  return NextResponse.json({ ok: true, status: 'completed' });
}
