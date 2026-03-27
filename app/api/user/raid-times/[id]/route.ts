import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** PATCH: Raidzeit-Präferenz aktualisieren */
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
  let body: { weekday?: string; timeSlot?: string; preference?: string; weekFocus?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const existing = await prisma.rfRaidTimePreference.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (body.preference && body.preference !== 'likely' && body.preference !== 'maybe') {
    return NextResponse.json(
      { error: 'preference muss "likely" oder "maybe" sein' },
      { status: 400 }
    );
  }
  const updated = await prisma.rfRaidTimePreference.update({
    where: { id },
    data: {
      ...(body.weekday != null && { weekday: body.weekday }),
      ...(body.timeSlot != null && { timeSlot: body.timeSlot }),
      ...(body.preference != null && { preference: body.preference }),
      ...(body.weekFocus !== undefined && { weekFocus: body.weekFocus || null }),
    },
  });
  return NextResponse.json({
    raidTime: {
      id: updated.id,
      weekday: updated.weekday,
      timeSlot: updated.timeSlot,
      preference: updated.preference,
      weekFocus: updated.weekFocus,
    },
  });
}

/** DELETE: Raidzeit-Präferenz löschen */
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
  const existing = await prisma.rfRaidTimePreference.findFirst({
    where: { id, userId },
  });
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await prisma.rfRaidTimePreference.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
