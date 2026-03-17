import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import {
  WEEKDAYS,
  TIME_SLOTS_30MIN,
  WEEK_FOCUS_WEEKDAY,
  WEEK_FOCUS_WEEKEND,
} from '@/lib/profile-constants';

type SlotInput = { weekday: string; timeSlot: string; preference: string };

const VALID_WEEKDAYS = new Set<string>(WEEKDAYS);
const VALID_SLOTS = new Set<string>(TIME_SLOTS_30MIN as unknown as string[]);
const VALID_PREFERENCES = new Set<string>(['likely', 'maybe']);

function isValidSlot(s: SlotInput): boolean {
  return (
    VALID_WEEKDAYS.has(s.weekday) &&
    VALID_SLOTS.has(s.timeSlot) &&
    VALID_PREFERENCES.has(s.preference)
  );
}

function isValidWeekFocus(v: string | null | undefined): boolean {
  return v === null || v === undefined || v === WEEK_FOCUS_WEEKDAY || v === WEEK_FOCUS_WEEKEND;
}

/** PUT: Alle Raidzeit-Präferenzen ersetzen (Bulk für Outlook-Grid). Body: { slots: SlotInput[], weekFocus?: string | null } */
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
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
  if (!isValidWeekFocus(weekFocus)) {
    return NextResponse.json(
      { error: 'Ungültige Raidzeiten: weekFocus muss "weekday", "weekend" oder null sein.' },
      { status: 400 }
    );
  }
  const invalidIndex = slots.findIndex((s) => !isValidSlot(s));
  if (invalidIndex !== -1) {
    return NextResponse.json(
      {
        error:
          'Ungültige Raidzeiten: weekday, timeSlot und preference müssen erlaubte Werte haben.',
        invalidIndex,
      },
      { status: 400 }
    );
  }

  const weekFocusValue = weekFocus ?? null;
  const data = slots.map((s) => ({
    userId,
    weekday: s.weekday,
    timeSlot: s.timeSlot,
    preference: s.preference,
    weekFocus: weekFocusValue,
  }));

  try {
    await prisma.$transaction(async (tx) => {
      await tx.rfRaidTimePreference.deleteMany({ where: { userId } });
      if (data.length > 0) {
        await tx.rfRaidTimePreference.createMany({ data });
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Raidzeiten speichern fehlgeschlagen';
    console.error('Raidzeiten bulk save failed:', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: slots.length });
}
