import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type SlotInput = { weekday: string; timeSlot: string; preference: string };

/** PUT: Alle Raidzeit-Präferenzen ersetzen (Bulk für Outlook-Grid). Body: { slots: SlotInput[], weekFocus?: string | null } */
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session as { userId?: string } | null)?.userId;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: { slots: SlotInput[]; weekFocus?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { slots, weekFocus } = body;
  if (!Array.isArray(slots)) {
    return NextResponse.json({ error: 'slots muss ein Array sein' }, { status: 400 });
  }
  for (const s of slots) {
    if (!s.weekday || !s.timeSlot || !s.preference) continue;
    if (s.preference !== 'likely' && s.preference !== 'maybe') continue;
  }
  const validSlots = slots.filter(
    (s) => s.weekday && s.timeSlot && (s.preference === 'likely' || s.preference === 'maybe')
  );

  await prisma.$transaction([
    prisma.rfRaidTimePreference.deleteMany({ where: { userId } }),
    ...validSlots.map((s) =>
      prisma.rfRaidTimePreference.create({
        data: {
          userId,
          weekday: s.weekday,
          timeSlot: s.timeSlot,
          preference: s.preference,
          weekFocus: weekFocus ?? null,
        },
      })
    ),
  ]);

  return NextResponse.json({ ok: true, count: validSlots.length });
}
