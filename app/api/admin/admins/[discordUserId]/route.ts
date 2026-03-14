import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';
import { getAppConfig } from '@/lib/app-config';

export const dynamic = 'force-dynamic';

/** DELETE: Admin entfernen. Owner (aus AppConfig) darf nicht entfernt werden. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ discordUserId: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { discordUserId } = await params;
  const config = await getAppConfig();
  if (config.ownerDiscordId === discordUserId) {
    return NextResponse.json({ error: 'Owner cannot be removed' }, { status: 400 });
  }
  await prisma.rfAppAdmin.deleteMany({ where: { discordUserId } });
  return NextResponse.json({ ok: true });
}
