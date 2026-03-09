import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** PATCH: Charakter aktualisieren */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = (session as { userId?: string } | null)?.userId;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  let body: { name?: string; guildId?: string | null; mainSpec?: string; offSpec?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const existing = await prisma.rfCharacter.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const updated = await prisma.rfCharacter.update({
    where: { id },
    data: {
      ...(body.name != null && { name: body.name.trim() }),
      ...(body.guildId !== undefined && { guildId: body.guildId || null }),
      ...(body.mainSpec != null && { mainSpec: body.mainSpec.trim() }),
      ...(body.offSpec !== undefined && { offSpec: body.offSpec?.trim() || null }),
    },
    include: { guild: { select: { id: true, name: true } } },
  });
  return NextResponse.json({
    character: {
      id: updated.id,
      name: updated.name,
      guildId: updated.guildId,
      guildName: updated.guild?.name ?? null,
      mainSpec: updated.mainSpec,
      offSpec: updated.offSpec,
    },
  });
}

/** DELETE: Charakter löschen */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = (session as { userId?: string } | null)?.userId;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  const existing = await prisma.rfCharacter.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await prisma.rfCharacter.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
