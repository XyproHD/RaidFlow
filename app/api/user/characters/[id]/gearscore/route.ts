import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { prisma } from '@/lib/prisma';
import { refreshCharacterGearscore } from '@/lib/battlenet-gearscore';
import { userIsGuildRaidLeaderOrMaster } from '@/lib/guild-master';
import { requireAdmin } from '@/lib/require-admin';

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const row = await prisma.rfCharacter.findFirst({
    where: { id },
    select: { id: true, userId: true, guildId: true },
  });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const adminSession = await requireAdmin();
  const isOwnCharacter = row.userId === userId;
  const isAppAdminOrOwner = adminSession !== null;
  const isGuildLeaderForAssignedGuild =
    row.guildId != null && (await userIsGuildRaidLeaderOrMaster(userId, row.guildId));

  if (!isOwnCharacter && !isAppAdminOrOwner && !isGuildLeaderForAssignedGuild) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const result = await refreshCharacterGearscore(id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Gearscore-Aktualisierung fehlgeschlagen.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
