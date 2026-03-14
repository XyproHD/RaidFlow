import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/** DELETE: Gilde löschen (inkl. abhängige Daten: Raids, Signups, Completions, RaidGroups, GuildAllowedChannel, UserGuild, GuildMember). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { guildId } = await params;
  const guild = await prisma.rfGuild.findUnique({ where: { id: guildId } });
  if (!guild) return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
  await prisma.rfGuild.delete({ where: { id: guildId } });
  return NextResponse.json({ ok: true });
}
