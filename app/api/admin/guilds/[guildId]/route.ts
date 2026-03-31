import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, AdminDatabaseError } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** DELETE: Gilde löschen (inkl. abhängige Daten: Raids, Signups, Completions, RaidGroups, GuildAllowedChannel, UserGuild, GuildMember). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
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
  const { guildId } = await params;
  const guild = await prisma.rfGuild.findUnique({ where: { id: guildId } });
  if (!guild) return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
  await prisma.rfGuild.delete({ where: { id: guildId } });
  return NextResponse.json({ ok: true });
}
