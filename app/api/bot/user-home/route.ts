import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBotSecret } from '@/lib/bot-auth';
import { findManyRfCharactersForProfile } from '@/lib/rf-character-gear-score-compat';

/**
 * GET /api/bot/user-home?discordUserId=...
 * Discord-Bot: Profil-Dashboard-Daten (Charaktere, Gilden) für einen Nutzer.
 * Auth: BOT_SETUP_SECRET.
 */
export async function GET(request: Request) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const discordUserId = searchParams.get('discordUserId')?.trim() ?? '';
  if (!discordUserId) {
    return NextResponse.json({ error: 'Missing discordUserId' }, { status: 400 });
  }

  const baseUrl =
    process.env.NEXTAUTH_URL?.replace(/\/$/, '') ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');

  const user = await prisma.rfUser.findUnique({
    where: { discordId: discordUserId },
    select: { id: true },
  });

  if (!user) {
    return NextResponse.json({
      linked: false,
      profileUrl: baseUrl ? `${baseUrl}/de/profile` : null,
      characters: [] as const,
      guilds: [] as const,
    });
  }

  const [guildRows, characters] = await Promise.all([
    prisma.rfUserGuild.findMany({
      where: { userId: user.id },
      include: { guild: { select: { id: true, name: true } } },
      orderBy: { guild: { name: 'asc' } },
    }),
    findManyRfCharactersForProfile(user.id),
  ]);

  return NextResponse.json({
    linked: true,
    profileUrl: baseUrl ? `${baseUrl}/de/profile` : null,
    characters: characters.map((c) => ({
      id: c.id,
      name: c.name,
      mainSpec: c.mainSpec,
      guildName: c.guild?.name ?? null,
      gearScore: c.gearScore,
      hasBattlenet: !!c.battlenetProfile?.battlenetCharacterId,
    })),
    guilds: guildRows.map((g) => ({ id: g.guild.id, name: g.guild.name })),
  });
}
