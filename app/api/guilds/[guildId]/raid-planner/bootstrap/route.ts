import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRaidPlannerOrForbid } from '@/lib/raid-planner-auth';
import { channelExists } from '@/lib/discord-guild-api';
import { getSpecByDisplayName, TBC_CLASSES, type TbcRole } from '@/lib/wow-tbc-classes';

function roleForMainSpec(mainSpec: string): TbcRole | null {
  const parsed = getSpecByDisplayName(mainSpec);
  if (!parsed) return null;
  const cls = TBC_CLASSES.find((c) => c.id === parsed.classId);
  const spec = cls?.specs.find((s) => s.id === parsed.specId);
  return spec?.role ?? null;
}

/**
 * GET /api/guilds/[guildId]/raid-planner/bootstrap?locale=de
 * Daten für „Neuer Raid“: Dungeons, Raidgruppen, erlaubte Channels, Leader-Pool, Mitglieder inkl. Raidzeiten.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const { guildId } = await params;
  const auth = await requireRaidPlannerOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  const locale = request.nextUrl.searchParams.get('locale')?.trim() || 'de';

  const guild = await prisma.rfGuild.findUnique({
    where: { id: guildId },
    select: { id: true },
  });
  if (!guild) {
    return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
  }

  const [dungeonsRaw, raidGroups, leaderUserGuilds, groupCharRows, guildMembers] = await Promise.all([
    prisma.rfDungeon.findMany({
      where: { instanceType: 'raid' },
      include: {
        names: { where: { locale } },
      },
      orderBy: { name: 'asc' },
    }),
    prisma.rfRaidGroup.findMany({
      where: { guildId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.rfUserGuild.findMany({
      where: {
        guildId,
        role: { in: ['raider', 'raidleader', 'guildmaster'] },
      },
      include: {
        user: {
          select: {
            id: true,
            characters: {
              where: { guildId },
              orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
              take: 5,
              select: {
                name: true,
                guildDiscordDisplayName: true,
                isMain: true,
              },
            },
          },
        },
      },
      orderBy: { userId: 'asc' },
    }),
    prisma.rfRaidGroupCharacter.findMany({
      where: { raidGroup: { guildId } },
      select: { raidGroupId: true, characterId: true, allowed: true },
    }),
    prisma.rfGuildMember.findMany({
      where: { guildId },
      include: {
        memberRaidGroups: { select: { raidGroupId: true } },
        user: {
          select: {
            id: true,
            raidTimePrefs: {
              select: {
                weekday: true,
                timeSlot: true,
                preference: true,
                weekFocus: true,
              },
            },
            characters: {
              where: { guildId },
              orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
              select: {
                id: true,
                name: true,
                mainSpec: true,
                offSpec: true,
                isMain: true,
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'asc' },
    }),
  ]);

  const dungeons = dungeonsRaw.map((d) => ({
    id: d.id,
    name: d.names[0]?.name ?? d.name,
    maxPlayers: d.maxPlayers,
  }));

  const leaders = leaderUserGuilds.map((row) => {
    const chars = row.user.characters;
    const labelChar = chars.find((c) => c.guildDiscordDisplayName) ?? chars[0];
    const label =
      labelChar?.guildDiscordDisplayName?.trim() ||
      labelChar?.name?.trim() ||
      `User ${row.user.id.slice(0, 8)}…`;
    return { userId: row.user.id, label };
  });

  const storedChannels = await prisma.rfGuildAllowedChannel.findMany({
    where: { guildId },
    orderBy: { createdAt: 'asc' },
  });
  const now = new Date();
  const allowedChannels: { id: string; discordChannelId: string; name: string | null }[] = [];
  for (const row of storedChannels) {
    const exists = await channelExists(row.discordChannelId);
    if (exists) {
      allowedChannels.push({
        id: row.id,
        discordChannelId: row.discordChannelId,
        name: row.name,
      });
      if (!row.lastValidatedAt) {
        await prisma.rfGuildAllowedChannel.update({
          where: { id: row.id },
          data: { lastValidatedAt: now },
        });
      }
    } else {
      await prisma.rfGuildAllowedChannel.delete({ where: { id: row.id } });
    }
  }

  const roleByUser = new Map(
    leaderUserGuilds.map((u) => [u.user.id, u.role as string])
  );

  const groupCharAllowed = groupCharRows.map((r) => ({
    raidGroupId: r.raidGroupId,
    characterId: r.characterId,
    allowed: r.allowed,
  }));

  const members = guildMembers.map((m) => {
    const prefs = m.user.raidTimePrefs;
    const weekFocus =
      prefs.find((p) => p.weekFocus === 'weekday' || p.weekFocus === 'weekend')?.weekFocus ?? null;

    const characters = m.user.characters.map((c) => {
      const parsed = getSpecByDisplayName(c.mainSpec);
      const role = roleForMainSpec(c.mainSpec);
      return {
        id: c.id,
        name: c.name,
        mainSpec: c.mainSpec,
        offSpec: c.offSpec,
        isMain: c.isMain,
        classId: parsed?.classId ?? null,
        specId: parsed?.specId ?? null,
        role,
      };
    });

    return {
      userId: m.user.id,
      guildMemberId: m.id,
      roleInGuild: roleByUser.get(m.userId) ?? 'member',
      weekFocus,
      raidTimeSlots: prefs.map((p) => ({
        weekday: p.weekday,
        timeSlot: p.timeSlot,
        preference: p.preference,
      })),
      raidGroupIds: m.memberRaidGroups.map((rg) => rg.raidGroupId),
      characters,
    };
  });

  return NextResponse.json({
    dungeons,
    raidGroups,
    allowedChannels,
    leaders,
    groupCharAllowed,
    members,
  });
}
