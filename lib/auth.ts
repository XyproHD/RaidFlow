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

      // Immer DB-User ermitteln: beim ersten Login (account/profile) oder Fallback per token.sub (jeder Request)
      if (discordId) {
        if (account?.access_token) {
          (token as { discordAccessToken?: string }).discordAccessToken = account.access_token;
        }
        try {
          const dbUser = await prisma.rfUser.upsert({
            where: { discordId },
            create: { discordId },
            update: { updatedAt: new Date() },
          });
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
