import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { getServerSession } from 'next-auth';
import { ThemeProvider } from '@/components/theme-provider';
import { SessionProvider } from '@/components/session-provider';
import { Topbar } from '@/components/topbar';
import { StatusBanner } from '@/components/status-banner';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getAppConfig } from '@/lib/app-config';
import { getBotInviteUrl } from '@/lib/bot-invite';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { getGuildsForUser } from '@/lib/user-guilds';
import type { UserGuildInfo } from '@/lib/user-guilds';
import '../globals.css';

export const metadata: Metadata = {
  title: 'RaidFlow',
  description: 'Raid-Planung für WoW-Gilden',
};

async function isApplicationAdmin(discordId: string): Promise<boolean> {
  const [ownerConfig, adminEntry] = await Promise.all([
    prisma.rfAppConfig.findUnique({ where: { key: 'owner_discord_id' } }),
    prisma.rfAppAdmin.findUnique({ where: { discordUserId: discordId } }),
  ]);
  return ownerConfig?.value === discordId || !!adminEntry;
}

export default async function LocaleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  let session = null;
  let isAdmin = false;
  let showGuildManagement = false;
  let botInviteUrl = '#';
  let userGuilds: UserGuildInfo[] = [];
  let appConfig: Awaited<ReturnType<typeof getAppConfig>> | null = null;
  try {
    session = await getServerSession(authOptions);
    const discordId = (session as { discordId?: string } | null)?.discordId;
    const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
    if (discordId) isAdmin = await isApplicationAdmin(discordId);
    if (userId) {
      const guildmaster = await prisma.rfUserGuild.findFirst({
        where: { userId, role: 'guildmaster' },
      });
      showGuildManagement = !!guildmaster;
      if (discordId) {
        try {
          userGuilds = await getGuildsForUser(userId, discordId);
        } catch (e) {
          console.error('[Layout] getGuildsForUser:', e);
        }
      }
    }
    botInviteUrl = getBotInviteUrl();
    appConfig = await getAppConfig();
  } catch (e) {
    console.error('[Layout] Session/DB/Env:', e);
    // Fallbacks: Seite rendern, Nutzer sieht z. B. Landing; Fehler in Vercel Logs
  }
  const isLoggedIn = !!session?.discordId;
  const discordBotInviteEnabled = appConfig?.discordBotInviteEnabled ?? true;
  const maintenanceMode = appConfig?.maintenanceMode ?? false;
  const statusMessage = appConfig?.statusMessage ?? '';
  const showStatusBanner = !maintenanceMode && statusMessage.trim().length > 0;

  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <SessionProvider>
          <ThemeProvider>
            <NextIntlClientProvider messages={messages}>
              <div className="min-h-screen flex flex-col bg-background">
                <Topbar
                  locale={locale}
                  isLoggedIn={isLoggedIn}
                  isAdmin={isAdmin}
                  showGuildManagement={showGuildManagement}
                  botInviteUrl={botInviteUrl}
                  userGuilds={userGuilds}
                  discordBotInviteEnabled={discordBotInviteEnabled}
                />
                {showStatusBanner && <StatusBanner message={statusMessage} />}
                <main className="flex-1">{children}</main>
              </div>
            </NextIntlClientProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
