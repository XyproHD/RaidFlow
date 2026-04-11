import { prisma } from '@/lib/prisma';

/** Stellt sicher, dass ein `rf_user` für die Discord-ID existiert (wie Login-Flow). */
export async function ensureUserIdForDiscordId(discordId: string): Promise<string> {
  const trimmed = discordId.trim();
  const user = await prisma.rfUser.upsert({
    where: { discordId: trimmed },
    create: { discordId: trimmed },
    update: { updatedAt: new Date() },
  });
  return user.id;
}
