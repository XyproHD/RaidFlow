import type { Metadata } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { getServerSession } from 'next-auth';
import { ThemeProvider } from '@/components/theme-provider';
import { SessionProvider } from '@/components/session-provider';
import { Topbar } from '@/components/topbar';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getBotInviteUrl } from '@/lib/bot-invite';
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
  let botInviteUrl = '#';
  try {
    session = await getServerSession(authOptions);
    const isLoggedIn = !!session?.discordId;
    isAdmin = isLoggedIn ? await isApplicationAdmin(session.discordId) : false;
    botInviteUrl = getBotInviteUrl();
  } catch (e) {
    console.error('[Layout] Session/DB/Env:', e);
    // Fallbacks: Seite rendern, Nutzer sieht z. B. Landing; Fehler in Vercel Logs
  }
  const isLoggedIn = !!session?.discordId;

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
                  showGuildManagement={false}
                  botInviteUrl={botInviteUrl}
                />
                <main className="flex-1">{children}</main>
              </div>
            </NextIntlClientProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
