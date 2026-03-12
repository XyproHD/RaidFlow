import type { NextAuthOptions } from 'next-auth';
import DiscordProvider from 'next-auth/providers/discord';
import { prisma } from '@/lib/prisma';

/**
 * NextAuth mit Discord Provider.
 * Datenminimierung: Nur id und discord_id in rf_user; keine E-Mail, kein Anzeigename.
 * Discord-Scope minimal: nur "identify" für User-ID.
 */
export const authOptions: NextAuthOptions = {
  debug: process.env.NODE_ENV === 'development', // Fehler im Terminal anzeigen
  providers: [
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID!,
      clientSecret: process.env.DISCORD_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'identify guilds', // identify = User-ID; guilds = für Bot-Einladung (Server wo User Owner/Manager)
        },
      },
    }),
  ],
  callbacks: {
    async signIn() {
      return true;
    },
    async jwt({ token, account, profile }) {
      // Beim ersten Login: User in DB anlegen/aktualisieren und DB-ID ins Token
      const discordId = profile && typeof (profile as { id?: string }).id === 'string' ? (profile as { id: string }).id : null;
      if (account && discordId) {
        try {
          const dbUser = await prisma.rfUser.upsert({
            where: { discordId },
            create: { discordId },
            update: { updatedAt: new Date() },
          });
          token.uid = dbUser.id;
          token.discordId = dbUser.discordId;
          // Discord access_token nur im JWT (nicht in Session), für API /api/discord/my-guilds
          if (account.access_token) token.discordAccessToken = account.access_token;
        } catch (e) {
          console.error('[NextAuth] DB-Upsert fehlgeschlagen:', e);
          token.uid = token.sub;
          token.discordId = discordId;
          if (account?.access_token) token.discordAccessToken = account.access_token;
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Immer userId/discordId aus Token in Session übernehmen (nicht nur bei session.user)
      const t = token as { uid?: string; discordId?: string };
      if (t.uid !== undefined) (session as { userId?: string; discordId?: string }).userId = t.uid;
      if (t.discordId !== undefined) (session as { userId?: string; discordId?: string }).discordId = t.discordId;
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
