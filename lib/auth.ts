import type { NextAuthOptions } from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';
import { prisma } from '@/lib/prisma';
import { refreshAllBattlenetCharactersForUser } from '@/lib/battlenet-gearscore';

/**
 * NextAuth mit Discord Provider.
 * Datenminimierung: Nur id und discord_id in rf_user; keine E-Mail, kein Anzeigename.
 * Scopes: identify, guilds, guilds.members.read (letzteres für Dashboard-Rollen ohne Bot-Member-Intent).
 */
export const authOptions: NextAuthOptions = {
  debug: process.env.NODE_ENV === 'development', // Fehler im Terminal anzeigen
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'identify guilds guilds.members.read',
        },
      },
    }),
  ],
  callbacks: {
    async signIn() {
      return true;
    },
    async jwt({ token, account, profile }) {
      const t = token as { uid?: string; discordId?: string; sub?: string };
      const discordIdFromProfile = profile && typeof (profile as { id?: string }).id === 'string' ? (profile as { id: string }).id : null;
      const discordId = discordIdFromProfile ?? (typeof t.sub === 'string' ? t.sub : null);

      // Wichtig für Serverless/Pooler: nicht bei JEDEM Request in die DB schreiben.
      // Wenn wir bereits eine DB-UID im Token haben und es kein echter Login/Refresh ist, skippen wir DB-Zugriffe.
      if (t.uid && t.discordId && !account && !profile) {
        return token;
      }

      // DB-User ermitteln: beim ersten Login (account/profile) oder wenn uid fehlt.
      if (discordId) {
        const withDiscordTok = token as { discordAccessToken?: string };
        if (account?.access_token) {
          withDiscordTok.discordAccessToken = account.access_token;
        }
        // Beim JWT-Refresh ist account leer — Feld bleibt aus dem dekodierten Token erhalten.
        try {
          const dbUser =
            account || profile || !t.uid
              ? await prisma.rfUser.upsert({
                  where: { discordId },
                  create: { discordId },
                  update: { updatedAt: new Date() },
                })
              : // Fallback: nur lesen, wenn uid bereits existiert (keine Schreiblast im Normalbetrieb).
                await prisma.rfUser.findUniqueOrThrow({ where: { discordId } });
          // Run heavy BNet updates only on actual login refreshes.
          if (account || profile) {
            void refreshAllBattlenetCharactersForUser(dbUser.id);
          }
          t.uid = dbUser.id;
          t.discordId = dbUser.discordId;
        } catch (e) {
          console.error('[NextAuth] DB-Upsert fehlgeschlagen:', e);
          if (discordIdFromProfile) {
            t.uid = t.sub ?? undefined;
            t.discordId = discordIdFromProfile;
          }
        }
      }

      return token;
    },
    async session({ session, token }) {
      const t = token as { uid?: string; discordId?: string };
      (session as { userId?: string; discordId?: string }).userId = t.uid ?? undefined;
      (session as { userId?: string; discordId?: string }).discordId = t.discordId ?? undefined;
      return session;
    },
  },
  pages: {
    signIn: '/', // Landing als „Login-Seite“ (Redirect nach Discord von dort)
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 Tage
  },
  secret: process.env.NEXTAUTH_SECRET,
};
