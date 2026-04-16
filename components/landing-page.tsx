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
  const tFooter = await getTranslations('footer');
  const tCommon = await getTranslations('common');
  const tMaintenance = await getTranslations('maintenance');
  const locale = await getLocale();
  const botInviteUrl = getBotInviteUrl();
  const hasStatusText = statusMessage.trim().length > 0;

  return (
    <main className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-16 relative overflow-hidden">
        {/* Subtiler radialer Hintergrundgradient */}
        <div className="pointer-events-none absolute inset-0 bg-hero-gradient" aria-hidden />

        <div className="relative z-10 flex flex-col items-center max-w-md text-center space-y-5">
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-foreground">
            {tCommon('appName')}
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed max-w-xs">
            {t('welcome')}
          </p>

          {maintenanceMode && hasStatusText && (
            <div className="w-full rounded-lg border border-border bg-muted/50 px-5 py-4 text-center">
              <p className="font-semibold text-foreground mb-2">{tMaintenance('title')}</p>
              <p className="text-muted-foreground whitespace-pre-wrap text-sm">{statusMessage.trim()}</p>
            </div>
          )}
          {!maintenanceMode && hasStatusText && (
            <p className="max-w-sm text-center text-sm text-muted-foreground whitespace-pre-wrap">
              {statusMessage.trim()}
            </p>
          )}

          {isAuthCallbackError(error) && (
            <div className="w-full rounded-lg border border-destructive/40 bg-destructive/10 px-5 py-4 text-left text-sm text-destructive">
              <p className="font-semibold">{t('loginErrorTitle')}</p>
              <p className="mt-1 text-muted-foreground">{t('loginErrorHint')}</p>
              {error ? (
                <p className="mt-2 text-xs text-muted-foreground font-mono break-all">{t('loginErrorParam', { code: error })}</p>
              ) : null}
              <p className="mt-2 font-mono text-xs break-all text-foreground">
                {process.env.NEXTAUTH_URL
                  ? `${process.env.NEXTAUTH_URL.replace(/\/$/, '')}/api/auth/callback/discord`
                  : 'http://localhost:3000/api/auth/callback/discord'}
              </p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 items-center pt-2 w-full sm:w-auto">
            <LoginButton text={t('loginWithDiscord')} callbackUrl={`/${locale}/dashboard`} />
            {discordBotInviteEnabled ? (
              <Link
                href={botInviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-6 py-3 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground min-h-[44px] transition-colors w-full sm:w-auto"
              >
                {t('discordBotInvite')}
              </Link>
            ) : (
              <span
                className="inline-flex items-center justify-center rounded-lg border border-border bg-muted/40 px-6 py-3 text-sm font-medium text-muted-foreground min-h-[44px] cursor-not-allowed opacity-50"
                aria-disabled="true"
              >
                {t('discordBotInvite')}
              </span>
            )}
          </div>
        </div>
      </div>

      <footer className="h-12 flex items-center justify-center gap-6 border-t border-border text-xs text-muted-foreground">
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
