import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireGuildMasterOrForbid } from '@/lib/guild-master';

/**
 * GET /api/guilds/[guildId]/members
 * Mitgliederliste der Gilde inkl. Raidgruppen-Zuordnung. Nur für Gildenmeister.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const { guildId } = await params;
  const auth = await requireGuildMasterOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  const members = await prisma.rfGuildMember.findMany({
    where: { guildId },
    include: {
      user: {
        select: {
          id: true,
          discordId: true,
          characters: {
            where: { guildId },
            select: {
              id: true,
              name: true,
              mainSpec: true,
              offSpec: true,
              isMain: true,
            },
            orderBy: { name: 'asc' },
          },
        },
      },
      raidGroup: { select: { id: true, name: true } },
    },
    orderBy: { joinedAt: 'asc' },
  });

  return NextResponse.json({
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      discordId: m.user.discordId,
      raidGroupId: m.raidGroupId,
      raidGroupName: m.raidGroup?.name ?? null,
      joinedAt: m.joinedAt,
      characters: m.user.characters.map((c) => ({
        id: c.id,
        name: c.name,
        mainSpec: c.mainSpec,
        offSpec: c.offSpec,
        isMain: c.isMain,
      })),
    })),
  });
}

/**
 * PATCH /api/guilds/[guildId]/members
 * Gruppenzuteilung für einen Member setzen.
 * Body: { memberId: string, raidGroupId: string | null }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const { guildId } = await params;
  const auth = await requireGuildMasterOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  let body: { memberId?: string; raidGroupId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const memberId = body.memberId;
  if (typeof memberId !== 'string' || !memberId.trim()) {
    return NextResponse.json(
      { error: 'Missing or invalid memberId' },
      { status: 400 }
    );
  }

  const raidGroupId =
    body.raidGroupId === null || body.raidGroupId === undefined
      ? null
      : typeof body.raidGroupId === 'string' && body.raidGroupId.trim()
        ? body.raidGroupId.trim()
        : null;

  if (raidGroupId !== null) {
    const group = await prisma.rfRaidGroup.findFirst({
      where: { id: raidGroupId, guildId },
    });
    if (!group) {
      return NextResponse.json(
        { error: 'Raid group not found or does not belong to this guild' },
        { status: 400 }
      );
    }
  }

  const member = await prisma.rfGuildMember.findFirst({
    where: { id: memberId, guildId },
  });
  if (!member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  const updated = await prisma.rfGuildMember.update({
    where: { id: memberId },
    data: { raidGroupId },
  });

  return NextResponse.json({ member: updated });
}
