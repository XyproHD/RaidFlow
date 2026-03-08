'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

const LOCALES = ['de', 'en'] as const;

type Props = {
  locale: string;
  isAdmin?: boolean;
  showGuildManagement?: boolean;
  botInviteUrl?: string;
  children: React.ReactNode;
};

/** Topbar + Burger-Menü + Hauptinhalt für geschützte Bereiche. */
export function Shell({ locale, isAdmin = false, showGuildManagement = false, botInviteUrl = '#', children }: Props) {
  const t = useTranslations('shell');
  const tCommon = useTranslations('common');
  const pathname = usePathname();
  const [burgerOpen, setBurgerOpen] = useState(false);

  const basePath = pathname?.replace(/^\/[a-z]{2}/, '') || '/dashboard';
  const switchLocaleUrl = (newLocale: string) => {
    return `/${newLocale}${basePath}`;
  };

  const closeBurger = useCallback(() => setBurgerOpen(false), []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Topbar: 48–56 px, RaidFlow links, Burger, rechts Sprachauswahl + Logout */}
      <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border bg-background px-4">
        <button
          type="button"
          onClick={() => setBurgerOpen(true)}
          className="flex items-center justify-center p-2 rounded-md text-foreground hover:bg-accent min-h-[44px] min-w-[44px]"
          aria-label="Menü öffnen"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link
          href={`/${locale}/dashboard`}
          className="text-xl font-semibold text-foreground hover:opacity-90"
        >
          {tCommon('appName')}
        </Link>
        <div className="flex-1" />
        <nav className="flex items-center gap-2" aria-label="Sprachauswahl">
          {LOCALES.map((loc) => (
            <Link
              key={loc}
              href={switchLocaleUrl(loc)}
              className={cn(
                'min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md px-2 text-sm font-medium transition-colors',
                locale === loc
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              {loc.toUpperCase()}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: `/${locale}` })}
          className="min-h-[44px] rounded-md px-4 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          {t('logout')}
        </button>
      </header>

      {/* Burger-Menü Overlay (Drawer von links) */}
      {burgerOpen && (
        <>
          <div
            className="fixed inset-0 z-50 bg-black/50"
            onClick={closeBurger}
            onKeyDown={(e) => e.key === 'Escape' && closeBurger()}
            role="button"
            tabIndex={0}
            aria-label="Menü schließen"
          />
          <aside
            className="fixed left-0 top-0 z-50 h-full w-64 border-r border-border bg-background shadow-lg flex flex-col"
            aria-modal="true"
            aria-label="Navigation"
          >
            <div className="flex items-center justify-between h-14 px-4 border-b border-border">
              <span className="font-semibold text-foreground">{tCommon('appName')}</span>
              <button
                type="button"
                onClick={closeBurger}
                className="p-2 rounded-md hover:bg-accent text-foreground"
                aria-label="Menü schließen"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex flex-col p-2">
              <Link
                href={`/${locale}/profile`}
                onClick={closeBurger}
                className="rounded-md px-4 py-3 text-foreground hover:bg-accent min-h-[44px] flex items-center"
              >
                {t('myProfile')}
              </Link>
              {showGuildManagement && (
                <Link
                  href={`/${locale}/guilds`}
                  onClick={closeBurger}
                  className="rounded-md px-4 py-3 text-foreground hover:bg-accent min-h-[44px] flex items-center"
                >
                  {t('guildManagement')}
                </Link>
              )}
              <a
                href={botInviteUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeBurger}
                className="rounded-md px-4 py-3 text-foreground hover:bg-accent min-h-[44px] flex items-center"
              >
                {t('discordBotInvite')}
              </a>
              {isAdmin && (
                <Link
                  href={`/${locale}/admin`}
                  onClick={closeBurger}
                  className="rounded-md px-4 py-3 text-foreground hover:bg-accent min-h-[44px] flex items-center"
                >
                  {t('admin')}
                </Link>
              )}
            </nav>
          </aside>
        </>
      )}

      <main className="flex-1">{children}</main>
    </div>
  );
}
