import { NextResponse } from 'next/server';
import { requireAdmin, AdminDatabaseError } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** GET: Alle Gilden (für Admin „Gilden löschen“). Ungefiltert durch Whitelist/Blacklist. */
export async function GET() {
  let admin: Awaited<ReturnType<typeof requireAdmin>>;
  try {
    admin = await requireAdmin();
  } catch (e) {
    if (e instanceof AdminDatabaseError) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }
    throw e;
  }
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const guilds = await prisma.rfGuild.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, discordGuildId: true },
  });
  return NextResponse.json({ guilds });
}
