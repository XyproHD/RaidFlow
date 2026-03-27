import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireGuildMasterOrForbid } from '@/lib/guild-master';
import {
  updateGuildRole,
  deleteGuildRole,
} from '@/lib/discord-guild-api';

const ROLE_PREFIX = 'Raidflowgroup-';

/**
 * PATCH /api/guilds/[guildId]/raid-groups/[raidGroupId]
 * Raidgruppe umbenennen (DB + Discord-Rolle). Body: { name: string }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ guildId: string; raidGroupId: string }> }
) {
  const { guildId, raidGroupId } = await params;
  const auth = await requireGuildMasterOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'Missing or empty name' }, { status: 400 });
  }

  const group = await prisma.rfRaidGroup.findFirst({
    where: { id: raidGroupId, guildId },
  });
  if (!group) {
    return NextResponse.json({ error: 'Raid group not found' }, { status: 404 });
  }

  const guild = await prisma.rfGuild.findUnique({
    where: { id: guildId },
  });
  if (!guild) {
    return NextResponse.json({ error: 'Guild not found' }, { status: 404 });
  }

  try {
    const roleName = `${ROLE_PREFIX}${name}`;
    if (group.discordRoleId) {
      await updateGuildRole(guild.discordGuildId, group.discordRoleId, roleName);
    }

    const updated = await prisma.rfRaidGroup.update({
      where: { id: raidGroupId },
      data: { name },
    });

    return NextResponse.json({ raidGroup: updated });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[API guilds raid-groups PATCH]', e);
    return NextResponse.json(
      {
        error: 'Failed to update raid group',
        detail: process.env.NODE_ENV === 'development' ? message : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/guilds/[guildId]/raid-groups/[raidGroupId]
 * Raidgruppe löschen (DB + optional Discord-Rolle entfernen).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ guildId: string; raidGroupId: string }> }
) {
  const { guildId, raidGroupId } = await params;
  const auth = await requireGuildMasterOrForbid(guildId);
  if (auth instanceof NextResponse) return auth;

  const group = await prisma.rfRaidGroup.findFirst({
    where: { id: raidGroupId, guildId },
  });
  if (!group) {
    return NextResponse.json({ error: 'Raid group not found' }, { status: 404 });
  }

  const guild = await prisma.rfGuild.findUnique({
    where: { id: guildId },
  });

  try {
    if (guild && group.discordRoleId) {
      await deleteGuildRole(guild.discordGuildId, group.discordRoleId);
    }
  } catch (e) {
    console.error('[API guilds raid-groups DELETE] Discord role delete:', e);
    // Continue to delete from DB even if Discord fails (e.g. role already deleted)
  }

  await prisma.rfRaidGroup.delete({
    where: { id: raidGroupId },
  });

  return NextResponse.json({ ok: true });
}
