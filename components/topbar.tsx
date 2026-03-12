'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ThemeSwitch } from '@/components/theme-switch';
import type { UserGuildInfo } from '@/lib/user-guilds';

const LOCALES = [
  { value: 'de', label: 'DE' },
  { value: 'en', label: 'EN' },
] as const;

export type TopbarProps = {
  locale: string;
  isLoggedIn: boolean;
  isAdmin?: boolean;
  showGuildManagement?: boolean;
  botInviteUrl?: string;
  userGuilds?: UserGuildInfo[];
};

/** Globale Topbar: Landing + geschützte Bereiche. Links RaidFlow, rechts Burger (eingeloggt), Sprach-Dropdown, Theme-Switch, Logout (eingeloggt). */
export function Topbar({
  locale,
  isLoggedIn,
  isAdmin = false,
  showGuildManagement = false,
  botInviteUrl = '#',
  userGuilds = [],
}: TopbarProps) {
  const t = useTranslations('shell');
  const tCommon = useTranslations('common');
  const tTopbar = useTranslations('topbar');
  const tDashboard = useTranslations('dashboard');
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [burgerOpen, setBurgerOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [guildMenuOpen, setGuildMenuOpen] = useState(false);

  const isDashboard = pathname?.includes('/dashboard') ?? false;
  const guildParam = searchParams?.get('guild') ?? null;
  const activeGuild = guildParam && userGuilds.length > 0
    ? userGuilds.find((g) => g.id === guildParam) ?? userGuilds[0]
    : userGuilds[0] ?? null;
  const showGuildInTopbar = isLoggedIn && isDashboard && userGuilds.length > 0;
  const hasMultipleGuilds = userGuilds.length > 1;

  const basePath = pathname?.replace(/^\/[a-z]{2}/, '') || '';
  const switchLocaleUrl = (newLocale: string) => `/${newLocale}${basePath || (isLoggedIn ? 'dashboard' : '')}`;

  const handleLocaleChange = (newLocale: string) => {
    setLangOpen(false);
    router.push(switchLocaleUrl(newLocale));
  };

  const closeBurger = useCallback(() => setBurgerOpen(false), []);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border bg-background px-4">
        <Link
          href={isLoggedIn ? `/${locale}/dashboard` : `/${locale}`}
          className="text-xl font-semibold text-foreground hover:opacity-90 shrink-0"
        >
          {tCommon('appName')}
        </Link>
        <div className="flex-1 min-w-0" />

        {/* Mittig: aktive Gilde (nur auf Dashboard, eingeloggt, Gilden vorhanden) */}
        {showGuildInTopbar && activeGuild && (
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
            <span className="text-sm font-medium text-foreground truncate max-w-[180px] md:max-w-[240px]" title={activeGuild.name}>
              {activeGuild.name}
            </span>
            {hasMultipleGuilds && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setGuildMenuOpen((o) => !o)}
                  className="flex items-center justify-center p-1.5 rounded-full text-foreground hover:bg-accent min-h-[36px] min-w-[36px]"
                  aria-label={tDashboard('selectGuild')}
                  aria-haspopup="listbox"
                  aria-expanded={guildMenuOpen}
                >
                  <span className="text-lg leading-none" aria-hidden>⋮</span>
                </button>
                {guildMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setGuildMenuOpen(false)} aria-hidden />
                    <ul
                      role="listbox"
                      className="absolute right-0 top-full z-50 mt-1 min-w-[200px] max-h-[60vh] overflow-auto rounded-md border border-border bg-background py-1 shadow-lg"
                    >
                      {userGuilds.map((g) => (
                        <li key={g.id} role="option" aria-selected={g.id === activeGuild.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setGuildMenuOpen(false);
                              router.push(`/${locale}/dashboard?guild=${encodeURIComponent(g.id)}`);
                            }}
                            className={cn(
                              'w-full px-4 py-2 text-left text-sm transition-colors truncate',
                              g.id === activeGuild.id
                                ? 'bg-accent text-accent-foreground font-medium'
                                : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                            )}
                          >
                            {g.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex-1 min-w-0" />

        {/* Rechts: Burger (nur eingeloggt), Sprach-Dropdown, Theme-Switch, Logout (nur eingeloggt) */}
        {isLoggedIn && (
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
        )}

        {/* Sprach-Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setLangOpen((o) => !o)}
            className="min-h-[44px] rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-accent inline-flex items-center gap-1"
            aria-haspopup="listbox"
            aria-expanded={langOpen}
            aria-label={tTopbar('language')}
          >
            {LOCALES.find((l) => l.value === locale)?.label ?? locale.slice(0, 2).toUpperCase()}
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {langOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} aria-hidden />
              <ul
                role="listbox"
                className="absolute right-0 top-full z-50 mt-1 min-w-[80px] rounded-md border border-border bg-background py-1 shadow-lg"
              >
                {LOCALES.map((loc) => (
                  <li key={loc.value} role="option" aria-selected={locale === loc.value}>
                    <button
                      type="button"
                      onClick={() => handleLocaleChange(loc.value)}
                      className={cn(
                        'w-full px-4 py-2 text-left text-sm transition-colors',
                        locale === loc.value
                          ? 'bg-accent text-accent-foreground font-medium'
                          : 'text-foreground hover:bg-accent hover:text-accent-foreground'
                      )}
                    >
                      {loc.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <ThemeSwitch className="shrink-0" />

        {isLoggedIn && (
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: `/${locale}` })}
            className="min-h-[44px] rounded-md px-4 text-sm font-medium text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            {t('logout')}
          </button>
        )}
      </header>

      {/* Burger-Menü Overlay (nur eingeloggt) */}
      {isLoggedIn && burgerOpen && (
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
            className="fixed right-0 top-0 z-50 h-full w-64 border-l border-border bg-background shadow-lg flex flex-col"
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
    </>
  );
}
