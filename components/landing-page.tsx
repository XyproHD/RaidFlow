import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { getBotInviteUrl } from '@/lib/bot-invite';
import { LoginButton } from '@/components/login-button';

export type LandingPageProps = {
  error?: string;
  discordBotInviteEnabled?: boolean;
  maintenanceMode?: boolean;
  statusMessage?: string;
};

export async function LandingPage({
  error,
  discordBotInviteEnabled = true,
  maintenanceMode = false,
  statusMessage = '',
}: LandingPageProps) {
  const t = await getTranslations('home');
  const tFooter = await getTranslations('footer');
  const tCommon = await getTranslations('common');
  const tMaintenance = await getTranslations('maintenance');
  const locale = await getLocale();
  const botInviteUrl = getBotInviteUrl();
  const hasStatusText = statusMessage.trim().length > 0;

  return (
    <main className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 text-center">
          {tCommon('appName')}
        </h1>
        <p className="text-muted-foreground mb-4 text-center">{t('welcome')}</p>

        {maintenanceMode && hasStatusText && (
          <div className="mb-6 max-w-lg rounded-lg border border-border bg-muted/50 px-4 py-4 text-center">
            <p className="font-semibold text-foreground mb-2">{tMaintenance('title')}</p>
            <p className="text-muted-foreground whitespace-pre-wrap text-sm">{statusMessage.trim()}</p>
          </div>
        )}
        {!maintenanceMode && hasStatusText && (
          <p className="mb-6 max-w-lg text-center text-sm text-muted-foreground whitespace-pre-wrap">
            {statusMessage.trim()}
          </p>
        )}

        {error === 'discord' && (
          <div className="mb-6 max-w-md rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <p className="font-medium">{t('loginErrorTitle')}</p>
            <p className="mt-1 text-muted-foreground">{t('loginErrorHint')}</p>
            <p className="mt-2 font-mono text-xs break-all">
              {process.env.NEXTAUTH_URL
                ? `${process.env.NEXTAUTH_URL}/api/auth/callback/discord`
                : 'http://localhost:3000/api/auth/callback/discord'}
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <LoginButton text={t('loginWithDiscord')} callbackUrl={`/${locale}/dashboard`} />
          {discordBotInviteEnabled ? (
            <Link
              href={botInviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-base font-medium text-foreground hover:bg-accent hover:text-accent-foreground min-h-[44px] transition-colors"
            >
              {t('discordBotInvite')}
            </Link>
          ) : (
            <span
              className="inline-flex items-center justify-center rounded-md border border-input bg-muted/50 px-6 py-3 text-base font-medium text-muted-foreground min-h-[44px] cursor-not-allowed opacity-60"
              aria-disabled="true"
            >
              {t('discordBotInvite')}
            </span>
          )}
        </div>
      </div>

      <footer className="h-10 flex items-center justify-center gap-6 border-t border-border text-sm text-muted-foreground">
        <Link href={`/${locale}/impressum`} className="hover:text-foreground transition-colors">
          {tFooter('imprint')}
        </Link>
        <Link href={`/${locale}/disclaimer`} className="hover:text-foreground transition-colors">
          {tFooter('disclaimer')}
        </Link>
      </footer>
    </main>
  );
}
