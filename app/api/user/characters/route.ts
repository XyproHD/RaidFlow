import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';

/** GET: Charaktere des eingeloggten Users */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const list = await prisma.rfCharacter.findMany({
    where: { userId },
    include: { guild: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json({
    characters: list.map((c) => ({
      id: c.id,
      name: c.name,
      guildId: c.guildId,
      guildName: c.guild?.name ?? null,
      mainSpec: c.mainSpec,
      offSpec: c.offSpec,
      isMain: c.isMain,
    })),
  });
}

/** POST: Neuen Charakter anlegen */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: { name: string; guildId?: string | null; mainSpec: string; offSpec?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { name, guildId, mainSpec, offSpec } = body;
  if (!name?.trim() || !mainSpec?.trim()) {
    return NextResponse.json(
      { error: 'name und mainSpec sind erforderlich' },
      { status: 400 }
    );
  }
  try {
    const created = await prisma.rfCharacter.create({
      data: {
        userId,
        name: name.trim(),
        guildId: guildId || null,
        mainSpec: mainSpec.trim(),
        offSpec: offSpec?.trim() || null,
        isMain: false,
      },
      include: { guild: { select: { id: true, name: true } } },
    });
    return NextResponse.json({
      character: {
        id: created.id,
        name: created.name,
        guildId: created.guildId,
        guildName: created.guild?.name ?? null,
        mainSpec: created.mainSpec,
        offSpec: created.offSpec,
        isMain: created.isMain,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Speichern fehlgeschlagen';
    console.error('Character create failed:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
