/**
 * Platzhalter für Session-Zugriff. Sobald NextAuth.js integriert ist (Phase 1),
 * hier getServerSession(authOptions) verwenden und User-Objekt mit discordId zurückgeben.
 */
export type SessionUser = { discordId: string };

export async function getSession(): Promise<{ user: SessionUser } | null> {
  // TODO: Nach Integration von NextAuth.js (Phase 1):
  // const session = await getServerSession(authOptions);
  // return session ? { user: { discordId: session.user.id } } : null;
  return null;
}
