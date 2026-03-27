import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import { prisma } from '@/lib/prisma';
import { getAppConfig } from '@/lib/app-config';

export const dynamic = 'force-dynamic';

/** GET: Liste aller Admins (Discord-IDs) + Owner-Discord-ID (aus AppConfig, nicht entfernbar). */
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const [config, admins] = await Promise.all([
    getAppConfig(),
    prisma.rfAppAdmin.findMany({
      orderBy: { createdAt: 'asc' },
      select: { discordUserId: true, addedByDiscordId: true, createdAt: true },
    }),
  ]);
  return NextResponse.json({
    ownerDiscordId: config.ownerDiscordId,
    admins: admins.map((a) => ({
      discordUserId: a.discordUserId,
      addedByDiscordId: a.addedByDiscordId,
      createdAt: a.createdAt,
    })),
  });
}

/** POST: Neuen Admin hinzufügen (Discord-ID). */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  let body: { discordUserId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const discordUserId = typeof body.discordUserId === 'string' ? body.discordUserId.trim() : '';
  if (!discordUserId) return NextResponse.json({ error: 'discordUserId required' }, { status: 400 });
  const config = await getAppConfig();
  if (config.ownerDiscordId === discordUserId) {
    return NextResponse.json({ error: 'Owner is always admin' }, { status: 400 });
  }
  await prisma.rfAppAdmin.upsert({
    where: { discordUserId },
    create: { discordUserId, addedByDiscordId: admin.discordId },
    update: {},
  });
  return NextResponse.json({ ok: true });
}
