import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireGuildMasterOrForbid } from '@/lib/guild-master';
import { channelExists } from '@/lib/discord-guild-api';

/**
 * GET /api/guilds/[guildId]/allowed-channels
 * Erlaubte Thread-Channels der Gilde. Nicht mehr existierende Channels werden
 * entfernt (Channel-Validierung) und die Liste dann zurückgegeben.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const { guildId } = await params;
  const auth = await requireGuildMasterOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  const stored = await prisma.rfGuildAllowedChannel.findMany({
    where: { guildId },
    orderBy: { createdAt: 'asc' },
  });

  const now = new Date();
  const valid: typeof stored = [];

  for (const row of stored) {
    const exists = await channelExists(row.discordChannelId);
    if (exists) {
      valid.push(row);
      if (!row.lastValidatedAt) {
        await prisma.rfGuildAllowedChannel.update({
          where: { id: row.id },
          data: { lastValidatedAt: now },
        });
      }
    } else {
      await prisma.rfGuildAllowedChannel.delete({
        where: { id: row.id },
      });
    }
  }

  return NextResponse.json({
    allowedChannels: valid.map((c) => ({
      id: c.id,
      discordChannelId: c.discordChannelId,
      name: c.name,
      lastValidatedAt: c.lastValidatedAt,
    })),
  });
}

/**
 * POST /api/guilds/[guildId]/allowed-channels
 * Erlaubte Channels setzen (Ersetzen der bisherigen Auswahl).
 * Body: { channels: Array<{ discordChannelId: string, name?: string }> }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ guildId: string }> }
) {
  const { guildId } = await params;
  const auth = await requireGuildMasterOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  let body: { channels?: Array<{ discordChannelId?: string; name?: string }> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = Array.isArray(body.channels) ? body.channels : [];
  const channels = raw
    .map((c) => ({
      discordChannelId:
        typeof c.discordChannelId === 'string' ? c.discordChannelId.trim() : '',
      name:
        typeof c.name === 'string' ? c.name.trim() || null : null,
    }))
    .filter((c) => c.discordChannelId.length > 0);

  const uniqueIds = [...new Set(channels.map((c) => c.discordChannelId))];
  if (uniqueIds.length !== channels.length) {
    return NextResponse.json(
      { error: 'Duplicate channel IDs not allowed' },
      { status: 400 }
    );
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.rfGuildAllowedChannel.deleteMany({ where: { guildId } });

    for (const ch of channels) {
      await tx.rfGuildAllowedChannel.create({
        data: {
          guildId,
          discordChannelId: ch.discordChannelId,
          name: ch.name,
          lastValidatedAt: now,
        },
      });
    }
  });

  const allowed = await prisma.rfGuildAllowedChannel.findMany({
    where: { guildId },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({
    allowedChannels: allowed.map((c) => ({
      id: c.id,
      discordChannelId: c.discordChannelId,
      name: c.name,
      lastValidatedAt: c.lastValidatedAt,
    })),
  });
}
