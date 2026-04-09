import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { verifyBotSecret } from '@/lib/bot-auth';
import { getSpecByDisplayName } from '@/lib/wow-tbc-classes';
import { characterToClientDto } from '@/lib/character-api-dto';
import {
  findUniqueRfCharacterForProfileDto,
} from '@/lib/rf-character-gear-score-compat';

/**
 * POST /api/bot/user-character
 * Body: { discordUserId, name, mainSpec, guildId?: string | null }
 * Legt einen Charakter für den per Discord verknüpften User an (wie Profil in der Webapp).
 * Auth: BOT_SETUP_SECRET.
 */
export async function POST(request: NextRequest) {
  if (!verifyBotSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { discordUserId?: string; name?: string; mainSpec?: string; guildId?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const discordUserId = typeof body.discordUserId === 'string' ? body.discordUserId.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const mainSpec = typeof body.mainSpec === 'string' ? body.mainSpec.trim() : '';
  const guildId =
    body.guildId === undefined || body.guildId === null || body.guildId === ''
      ? null
      : String(body.guildId).trim() || null;

  if (!discordUserId || !name || !mainSpec) {
    return NextResponse.json(
      { error: 'discordUserId, name und mainSpec sind erforderlich' },
      { status: 400 }
    );
  }

  if (!getSpecByDisplayName(mainSpec)) {
    return NextResponse.json({ error: 'Ungültige Spezialisierung (mainSpec)' }, { status: 400 });
  }

  const user = await prisma.rfUser.findUnique({
    where: { discordId: discordUserId },
    select: { id: true },
  });
  if (!user) {
    return NextResponse.json(
      {
        error: 'NOT_LINKED',
        message:
          'Discord-Konto ist noch nicht mit RaidFlow verknüpft. Bitte einmal in der Webapp mit Discord anmelden.',
      },
      { status: 403 }
    );
  }

  if (guildId) {
    const membership = await prisma.rfUserGuild.findUnique({
      where: { userId_guildId: { userId: user.id, guildId } },
    });
    if (!membership) {
      return NextResponse.json(
        { error: 'Keine Berechtigung für diese Gilde oder Gilde unbekannt.' },
        { status: 403 }
      );
    }
  }

  try {
    const createdId = await prisma.$transaction(async (tx) => {
      const created = await tx.rfCharacter.create({
        data: {
          userId: user.id,
          name,
          guildId,
          mainSpec,
          offSpec: null,
          isMain: false,
        },
      });
      return created.id;
    });

    const saved = await findUniqueRfCharacterForProfileDto(createdId);
    return NextResponse.json({ character: characterToClientDto(saved) });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return NextResponse.json(
        { error: 'Dieser Charakter bzw. diese Zuordnung existiert bereits.' },
        { status: 409 }
      );
    }
    const message = err instanceof Error ? err.message : 'Speichern fehlgeschlagen';
    console.error('[API bot/user-character]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
