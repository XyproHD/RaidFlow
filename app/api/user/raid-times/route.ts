import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** GET: Raidzeit-Präferenzen des eingeloggten Users */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = (session as { userId?: string } | null)?.userId;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const list = await prisma.rfRaidTimePreference.findMany({
    where: { userId },
    orderBy: [{ weekday: 'asc' }, { timeSlot: 'asc' }],
  });
  return NextResponse.json({
    raidTimes: list.map((r) => ({
      id: r.id,
      weekday: r.weekday,
      timeSlot: r.timeSlot,
      preference: r.preference,
      weekFocus: r.weekFocus,
    })),
  });
}

/** POST: Neue Raidzeit-Präferenz anlegen */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session as { userId?: string } | null)?.userId;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: { weekday: string; timeSlot: string; preference: string; weekFocus?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { weekday, timeSlot, preference, weekFocus } = body;
  if (!weekday || !timeSlot || !preference) {
    return NextResponse.json(
      { error: 'weekday, timeSlot und preference sind erforderlich' },
      { status: 400 }
    );
  }
  if (preference !== 'likely' && preference !== 'maybe') {
    return NextResponse.json(
      { error: 'preference muss "likely" oder "maybe" sein' },
      { status: 400 }
    );
  }
  const created = await prisma.rfRaidTimePreference.create({
    data: {
      userId,
      weekday,
      timeSlot,
      preference,
      weekFocus: weekFocus || null,
    },
  });
  return NextResponse.json({
    raidTime: {
      id: created.id,
      weekday: created.weekday,
      timeSlot: created.timeSlot,
      preference: created.preference,
      weekFocus: created.weekFocus,
    },
  });
}
