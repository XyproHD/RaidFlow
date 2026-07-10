import { getTranslations } from 'next-intl/server';
import { SiteFooter } from '@/components/site-footer';
import { getBotInviteUrl } from '@/lib/bot-invite';
import { LoginButton } from '@/components/login-button';
import Link from 'next/link';
import { getLocale } from 'next-intl/server';

export type LandingPageProps = {
  error?: string;
  discordBotInviteEnabled?: boolean;
  maintenanceMode?: boolean;
  statusMessage?: string;
};

/** NextAuth leitet bei fehlgeschlagenem OAuth mit error=… auf die Sign-In-Seite (hier /). */
function isAuthCallbackError(error: string | undefined): boolean {
  if (!error) return false;
  if (error === 'discord') return true;
  return [
    'OAuthCallback',
    'OAuthSignin',
    'Callback',
    'Configuration',
    'AccessDenied',
    'OAuthAccountNotLinked',
  ].includes(error);
}

export async function LandingPage({
  error,
  discordBotInviteEnabled = true,
  maintenanceMode = false,
  statusMessage = '',
}: LandingPageProps) {
  const t = await getTranslations('home');
  const tCommon = await getTranslations('common');
  const tMaintenance = await getTranslations('maintenance');
  const locale = await getLocale();
  const botInviteUrl = getBotInviteUrl();
  const hasStatusText = statusMessage.trim().length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-12 md:py-16">
        <div className="pointer-events-none absolute inset-0 bg-hero-gradient" aria-hidden />

        <div className="relative z-10 page-container flex flex-col items-center text-center space-y-5">
          <h1 className="text-5xl font-bold tracking-tight text-foreground md:text-6xl">
            {tCommon('appName')}
          </h1>
          <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
            {t('welcome')}
          </p>

          {maintenanceMode && hasStatusText && (
            <div className="w-full rounded-lg border border-border bg-muted/50 px-5 py-4 text-center">
              <p className="mb-2 font-semibold text-foreground">{tMaintenance('title')}</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">{statusMessage.trim()}</p>
            </div>
          )}
          {!maintenanceMode && hasStatusText && (
            <p className="w-full whitespace-pre-wrap text-center text-sm text-muted-foreground">
              {statusMessage.trim()}
            </p>
          )}

          {isAuthCallbackError(error) && (
            <div className="w-full rounded-lg border border-destructive/40 bg-destructive/10 px-5 py-4 text-left text-sm text-destructive">
              <p className="font-semibold">{t('loginErrorTitle')}</p>
              <p className="mt-1 text-muted-foreground">{t('loginErrorHint')}</p>
              {error ? (
                <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
                  {t('loginErrorParam', { code: error })}
                </p>
              ) : null}
              <p className="mt-2 break-all font-mono text-xs text-foreground">
                {process.env.NEXTAUTH_URL
                  ? `${process.env.NEXTAUTH_URL.replace(/\/$/, '')}/api/auth/callback/discord`
                  : 'http://localhost:3000/api/auth/callback/discord'}
              </p>
            </div>
          )}

          <div className="flex w-full flex-col items-center gap-3 pt-2 sm:w-auto sm:flex-row">
            <LoginButton text={t('loginWithDiscord')} callbackUrl={`/${locale}/dashboard`} />
            {discordBotInviteEnabled ? (
              <Link
                href={botInviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-border bg-background px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground sm:w-auto"
              >
                {t('discordBotInvite')}
              </Link>
            ) : (
              <span
                className="inline-flex min-h-[44px] w-full cursor-not-allowed items-center justify-center rounded-lg border border-border bg-muted/40 px-6 py-3 text-sm font-medium text-muted-foreground opacity-50 sm:w-auto"
                aria-disabled="true"
              >
                {t('discordBotInvite')}
              </span>
            )}
          </div>
        </div>
      </div>

      <SiteFooter />
    </div>
  );
}
