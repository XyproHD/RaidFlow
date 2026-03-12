import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';

/** PATCH: Charakter aktualisieren */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await params;
  let body: { name?: string; guildId?: string | null; mainSpec?: string; offSpec?: string | null; isMain?: boolean };
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
  if (body.isMain === true && existing.guildId) {
    await prisma.rfCharacter.updateMany({
      where: { userId, guildId: existing.guildId, id: { not: id } },
      data: { isMain: false },
    });
  }
  const updated = await prisma.rfCharacter.update({
    where: { id },
    data: {
      ...(body.name != null && { name: body.name.trim() }),
      ...(body.guildId !== undefined && { guildId: body.guildId || null }),
      ...(body.mainSpec != null && { mainSpec: body.mainSpec.trim() }),
      ...(body.offSpec !== undefined && { offSpec: body.offSpec?.trim() || null }),
      ...(body.isMain !== undefined && { isMain: !!body.isMain }),
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
      isMain: updated.isMain,
    },
  });
}

/** DELETE: Charakter löschen */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
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
