import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** GET: Alle Gilden (für Admin „Gilden löschen“). Ungefiltert durch Whitelist/Blacklist. */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const guilds = await prisma.rfGuild.findMany({
    orderBy: { name: 'asc' },
    select: { id: true, name: true, discordGuildId: true },
  });
  return NextResponse.json({ guilds });
}
