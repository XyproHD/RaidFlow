import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, AdminDatabaseError } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';
import { getAppConfig } from '@/lib/app-config';

export const dynamic = 'force-dynamic';

/** DELETE: Admin entfernen. Owner (aus AppConfig) darf nicht entfernt werden. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ discordUserId: string }> }
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
  const { discordUserId } = await params;
  const config = await getAppConfig();
  if (config.ownerDiscordId === discordUserId) {
    return NextResponse.json({ error: 'Owner cannot be removed' }, { status: 400 });
  }
  await prisma.rfAppAdmin.deleteMany({ where: { discordUserId } });
  return NextResponse.json({ ok: true });
}
