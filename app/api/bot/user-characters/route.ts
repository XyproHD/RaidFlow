import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyBotSecret } from '@/lib/bot-auth';

/**
 * GET /api/bot/user-characters?discordUserId=...&guildId=...
 * Discord-Bot: Charaktere eines Users (optional nach Gilde gefiltert).
 * Auth: BOT_SETUP_SECRET.
 */
export async function GET(request: Request) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const discordUserId = searchParams.get('discordUserId')?.trim() ?? '';
  const guildId = searchParams.get('guildId')?.trim() ?? '';
  if (!discordUserId) {
    return NextResponse.json({ error: 'Missing discordUserId' }, { status: 400 });
  }

  const user = await prisma.rfUser.findUnique({
    where: { discordId: discordUserId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json({ linked: false, characters: [] as const });
  }

  const chars = await prisma.rfCharacter.findMany({
    where: {
      userId: user.id,
      ...(guildId ? { guildId } : {}),
    },
    select: {
      id: true,
      name: true,
      guildId: true,
      mainSpec: true,
      offSpec: true,
      isMain: true,
    },
    orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
    take: 25,
  });

  return NextResponse.json({ linked: true, characters: chars });
}

