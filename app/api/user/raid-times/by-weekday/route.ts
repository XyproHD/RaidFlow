import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/** DELETE: Alle Raidzeit-Präferenzen eines Wochentags löschen. Query: weekday=Mo|Di|... */
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = (session as { userId?: string } | null)?.userId;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const weekday = request.nextUrl.searchParams.get('weekday');
  if (!weekday) {
    return NextResponse.json({ error: 'weekday erforderlich' }, { status: 400 });
  }
  await prisma.rfRaidTimePreference.deleteMany({
    where: { userId, weekday },
  });
  return NextResponse.json({ ok: true });
}
