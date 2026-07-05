import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireRaidPlannerOrForbid } from '@/lib/raid-planner-auth';
import { resolveGuestEligibility } from '@/lib/guest-raid-access';
import { getSpecByDisplayName, TBC_CLASSES, type TbcRole } from '@/lib/wow-tbc-classes';

function roleForMainSpec(mainSpec: string): TbcRole | null {
  const parsed = getSpecByDisplayName(mainSpec);
  if (!parsed) return null;
  const cls = TBC_CLASSES.find((c) => c.id === parsed.classId);
  const spec = cls?.specs.find((s) => s.id === parsed.specId);
  return spec?.role ?? null;
}

/**
 * GET /api/guilds/[guildId]/raid-planner/guest-candidates
 * Discord-Gäste mit rf_user + mindestens einem Charakter (für Planer Add-Modal).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const { guildId } = await params;
  const auth = await requireRaidPlannerOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  const raidId = request.nextUrl.searchParams.get('raidId')?.trim() || '';
  const raid = raidId
    ? await prisma.rfRaid.findFirst({
        where: { id: raidId, guildId },
        select: { allowGuests: true },
      })
    : null;
  if (raidId && !raid?.allowGuests) {
    return NextResponse.json({ candidates: [] });
  }

  const usersWithChars = await prisma.rfUser.findMany({
    where: {
      characters: { some: {} },
      NOT: {
        userGuilds: {
          some: {
            guildId,
            role: { in: ['guildmaster', 'raidleader', 'raider'] },
          },
        },
      },
    },
    select: {
      id: true,
      discordId: true,
      characters: {
        select: {
          id: true,
          name: true,
          mainSpec: true,
          offSpec: true,
          isMain: true,
          gearScore: true,
          guildId: true,
          guildDiscordDisplayName: true,
        },
        orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
      },
    },
    take: 500,
  });

  const candidates: Array<{
    userId: string;
    discordId: string;
    displayName: string;
    characters: Array<{
      id: string;
      name: string;
      mainSpec: string;
      offSpec: string | null;
      isMain: boolean;
      gearScore: number | null;
      classId: string | null;
      role: TbcRole | null;
    }>;
  }> = [];

  for (const u of usersWithChars) {
    const guest = await resolveGuestEligibility(u.id, u.discordId, guildId);
    if (!guest.eligible) continue;

    const displayName =
      guest.displayNameInGuild?.trim() ||
      u.characters.find((c) => c.guildDiscordDisplayName?.trim())?.guildDiscordDisplayName?.trim() ||
      u.discordId;

    candidates.push({
      userId: u.id,
      discordId: u.discordId,
      displayName,
      characters: u.characters.map((c) => {
        const parsed = getSpecByDisplayName(c.mainSpec);
        return {
          id: c.id,
          name: c.name,
          mainSpec: c.mainSpec,
          offSpec: c.offSpec,
          isMain: c.isMain,
          gearScore: c.gearScore ?? null,
          classId: parsed?.classId ?? null,
          role: roleForMainSpec(c.mainSpec),
        };
      }),
    });
  }

  candidates.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: 'base' }));

  return NextResponse.json({ candidates });
}
