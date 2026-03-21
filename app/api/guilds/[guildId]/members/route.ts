import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireGuildMasterOrForbid } from '@/lib/guild-master';
import { addRoleToMember, removeRoleFromMember } from '@/lib/discord-guild-api';

/**
 * GET /api/guilds/[guildId]/members
 * Mitgliederliste der Gilde inkl. Raidgruppen-Zuordnung (mehrere pro Member). Nur für Gildenmeister.
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
              guildDiscordDisplayName: true,
              battlenetProfile: { select: { battlenetCharacterId: true } },
            },
            orderBy: { name: 'asc' },
          },
        },
      },
      memberRaidGroups: {
        include: { raidGroup: { select: { id: true, name: true } } },
      },
    },
    orderBy: { joinedAt: 'asc' },
  });

  return NextResponse.json({
    members: members.map((m) => ({
      id: m.id,
      userId: m.userId,
      discordId: m.user.discordId,
      raidGroupIds: m.memberRaidGroups.map((rg) => rg.raidGroup.id),
      raidGroups: m.memberRaidGroups.map((rg) => ({
        id: rg.raidGroup.id,
        name: rg.raidGroup.name,
      })),
      joinedAt: m.joinedAt,
      characters: m.user.characters.map((c) => ({
        id: c.id,
        name: c.name,
        mainSpec: c.mainSpec,
        offSpec: c.offSpec,
        isMain: c.isMain,
        guildDiscordDisplayName: c.guildDiscordDisplayName,
        hasBattlenet: !!c.battlenetProfile?.battlenetCharacterId,
      })),
    })),
  });
}

/**
 * PATCH /api/guilds/[guildId]/members
 * Raidgruppen-Zuordnung für einen Member setzen (mehrere Gruppen möglich).
 * Body: { memberId: string, raidGroupIds: string[] }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const { guildId } = await params;
  const auth = await requireGuildMasterOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  let body: { memberId?: string; raidGroupIds?: string[] };
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

  const rawIds = Array.isArray(body.raidGroupIds) ? body.raidGroupIds : [];
  const raidGroupIds = rawIds.filter(
    (id): id is string => typeof id === 'string' && id.trim().length > 0
  );

  if (raidGroupIds.length > 0) {
    const groups = await prisma.rfRaidGroup.findMany({
      where: { id: { in: raidGroupIds }, guildId },
      select: { id: true, discordRoleId: true },
    });
    const foundIds = new Set(groups.map((g) => g.id));
    const invalid = raidGroupIds.filter((id) => !foundIds.has(id));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: 'Raid group(s) not found or do not belong to this guild' },
        { status: 400 }
      );
    }
  }

  const member = await prisma.rfGuildMember.findFirst({
    where: { id: memberId, guildId },
    include: {
      user: { select: { discordId: true } },
      memberRaidGroups: {
        include: { raidGroup: { select: { id: true, discordRoleId: true } } },
      },
    },
  });
  if (!member) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  const guild = await prisma.rfGuild.findUnique({
    where: { id: guildId },
    select: { discordGuildId: true },
  });

  const currentIds = new Set(
    member.memberRaidGroups.map((rg) => rg.raidGroup.id)
  );
  const nextIds = new Set(raidGroupIds);
  const toAdd = raidGroupIds.filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !nextIds.has(id));

  const raidGroupsWithDiscord = await prisma.rfRaidGroup.findMany({
    where: { guildId },
    select: { id: true, discordRoleId: true },
  });
  const roleByGroupId = new Map(
    raidGroupsWithDiscord.map((g) => [g.id, g.discordRoleId])
  );

  if (guild?.discordGuildId) {
    const discordId = member.user.discordId;
    for (const groupId of toRemove) {
      const roleId = roleByGroupId.get(groupId);
      if (roleId) {
        try {
          await removeRoleFromMember(guild.discordGuildId, discordId, roleId);
        } catch (e) {
          console.error('[API guilds members PATCH] Discord remove role:', e);
        }
      }
    }
    for (const groupId of toAdd) {
      const roleId = roleByGroupId.get(groupId);
      if (roleId) {
        try {
          await addRoleToMember(guild.discordGuildId, discordId, roleId);
        } catch (e) {
          console.error('[API guilds members PATCH] Discord add role:', e);
        }
      }
    }
  }

  await prisma.$transaction([
    prisma.rfGuildMemberRaidGroup.deleteMany({
      where: { guildMemberId: memberId },
    }),
    ...raidGroupIds.map((raidGroupId) =>
      prisma.rfGuildMemberRaidGroup.create({
        data: { guildMemberId: memberId, raidGroupId },
      })
    ),
  ]);

  const updated = await prisma.rfGuildMember.findUnique({
    where: { id: memberId },
    include: {
      memberRaidGroups: {
        include: { raidGroup: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json({
    member: updated
      ? {
          id: updated.id,
          raidGroupIds: updated.memberRaidGroups.map((rg) => rg.raidGroup.id),
          raidGroups: updated.memberRaidGroups.map((rg) => ({
            id: rg.raidGroup.id,
            name: rg.raidGroup.name,
          })),
        }
      : null,
  });
}
