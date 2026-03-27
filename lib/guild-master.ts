/**
 * Prüft, ob der eingeloggte User Gildenmeister der angegebenen Gilde ist.
 * Für Gildenverwaltung (Phase 4) und Rechteprüfung.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { prisma } from '@/lib/prisma';

export interface GuildMasterResult {
  userId: string;
  guildId: string;
}

/**
 * Prüft Session und ob User Gildenmeister der Gilde (rf_guild.id) ist.
 * Gibt userId und guildId zurück oder null.
 */
export async function requireGuildMasterForGuildId(
  guildId: string
): Promise<GuildMasterResult | null> {
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(
    session as { userId?: string; discordId?: string } | null
  );
  if (!userId) return null;

  const ug = await prisma.rfUserGuild.findUnique({
    where: {
      userId_guildId: { userId, guildId },
    },
  });
  if (!ug || ug.role !== 'guildmaster') return null;

  return { userId, guildId };
}

/**
 * Prüft Gildenmeister-Recht; gibt bei Fehlern NextResponse für 401/403 zurück.
 * Für API-Routen: const auth = await requireGuildMasterOrForbid(guildId);
 * if (auth instanceof NextResponse) return auth;
 */
export async function requireGuildMasterOrForbid(
  guildId: string
): Promise<GuildMasterResult | NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.discordId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await requireGuildMasterForGuildId(guildId);
  if (!result) {
    return NextResponse.json(
      { error: 'Forbidden: Guild master required' },
      { status: 403 }
    );
  }
  return result;
}
