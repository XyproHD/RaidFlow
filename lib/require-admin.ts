import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export interface AdminSession {
  userId: string;
  discordId: string;
}

/** Prüft, ob der aktuelle User Application-Admin (Owner oder in AppAdmin) ist. Gibt Session-Infos oder null zurück. */
export async function requireAdmin(): Promise<AdminSession | null> {
  const session = await getServerSession(authOptions);
  const discordId = (session as { discordId?: string } | null)?.discordId;
  if (!discordId) return null;

  const [ownerConfig, adminEntry] = await Promise.all([
    prisma.rfAppConfig.findUnique({ where: { key: 'owner_discord_id' } }),
    prisma.rfAppAdmin.findUnique({ where: { discordUserId: discordId } }),
  ]);
  const isAdmin = ownerConfig?.value === discordId || !!adminEntry;
  if (!isAdmin) return null;

  const user = await prisma.rfUser.findUnique({ where: { discordId }, select: { id: true } });
  if (!user) return null;

  return { userId: user.id, discordId };
}
