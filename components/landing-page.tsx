import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { getBotInviteUrl } from '@/lib/bot-invite';
import { LoginButton } from '@/components/login-button';

export async function LandingPage({ error }: { error?: string }) {
  const t = await getTranslations('home');
  const tFooter = await getTranslations('footer');
  const tCommon = await getTranslations('common');
  const locale = await getLocale();
  const botInviteUrl = getBotInviteUrl();

  return (
    <main className="min-h-screen flex flex-col bg-background">
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4 text-center">
          {tCommon('appName')}
        </h1>
        <p className="text-muted-foreground mb-8 text-center">{t('welcome')}</p>

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
          <Link
            href={botInviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-6 py-3 text-base font-medium text-foreground hover:bg-accent hover:text-accent-foreground min-h-[44px] transition-colors"
          >
            {t('discordBotInvite')}
          </Link>
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
