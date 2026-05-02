'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useTranslations } from 'next-intl';
import { useState, useCallback, useEffect } from 'react';
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
  discordBotInviteEnabled?: boolean;
  initialUserGuilds?: UserGuildInfo[];
};

export function Topbar({
  locale,
  isLoggedIn,
  isAdmin = false,
  showGuildManagement = false,
  botInviteUrl = '#',
  discordBotInviteEnabled = true,
  initialUserGuilds = [],
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
  const [userGuilds, setUserGuilds] = useState<UserGuildInfo[]>(initialUserGuilds);

  useEffect(() => {
    setUserGuilds(initialUserGuilds);
  }, [initialUserGuilds]);

  const isDashboard = pathname?.includes('/dashboard') ?? false;
  const isGuildsPage = pathname?.includes('/guilds') ?? false;
  const guildParam = searchParams?.get('guild') ?? null;
  const activeGuild = guildParam && userGuilds.length > 0
    ? userGuilds.find((g) => g.id === guildParam) ?? userGuilds[0]
    : userGuilds[0] ?? null;
  const showGuildInTopbar = isLoggedIn && (isDashboard || isGuildsPage) && userGuilds.length > 0;
  const hasMultipleGuilds = userGuilds.length > 1;

  const basePath = pathname?.replace(/^\/[a-z]{2}/, '') || '';
  const switchLocaleUrl = (newLocale: string) => `/${newLocale}${basePath || (isLoggedIn ? 'dashboard' : '')}`;

  const handleLocaleChange = (newLocale: string) => {
    setLangOpen(false);
    router.push(switchLocaleUrl(newLocale));
  };

  const closeBurger = useCallback(() => setBurgerOpen(false), []);

  useEffect(() => {
    if (!burgerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeBurger();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [burgerOpen, closeBurger]);

  const needsGuildList = isLoggedIn && (isDashboard || isGuildsPage);
  useEffect(() => {
    if (!needsGuildList || userGuilds.length > 0) return;
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch('/api/user/guilds', { credentials: 'include', signal: ac.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { guilds?: UserGuildInfo[] };
        if (Array.isArray(data.guilds)) setUserGuilds(data.guilds);
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
        console.error('[Topbar] guilds fetch', e);
      }
    })();
    return () => ac.abort();
  }, [needsGuildList, pathname, userGuilds.length]);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background/95 backdrop-blur-sm px-4 md:px-6">
        {/* Brand */}
        <Link
          href={isLoggedIn ? `/${locale}/dashboard` : `/${locale}`}
          className="text-base font-bold tracking-tight text-foreground hover:text-primary shrink-0 transition-colors"
        >
          {tCommon('appName')}
        </Link>

        <div className="flex-1 min-w-0" />

        {/* Center: aktive Gilde */}
        {showGuildInTopbar && activeGuild && (
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
            <span className="text-sm font-medium text-muted-foreground truncate max-w-[160px] md:max-w-[220px]" title={activeGuild.name}>
              {activeGuild.name}
            </span>
            {hasMultipleGuilds && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setGuildMenuOpen((o) => !o)}
                  className="flex items-center justify-center p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors min-h-[32px] min-w-[32px]"
                  aria-label={tDashboard('selectGuild')}
                  aria-haspopup="listbox"
                  aria-expanded={guildMenuOpen}
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {guildMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setGuildMenuOpen(false)} aria-hidden />
                    <ul
                      role="listbox"
                      className="absolute right-0 top-full z-50 mt-1.5 min-w-[200px] max-h-[60vh] overflow-auto rounded-xl border border-border bg-popover py-1 shadow-lg"
                    >
                      {userGuilds.map((g) => (
                        <li key={g.id} role="option" aria-selected={g.id === activeGuild.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setGuildMenuOpen(false);
                              const base = pathname ?? `/${locale}/dashboard`;
                              const sep = base.includes('?') ? '&' : '?';
                              router.push(`${base}${sep}guild=${encodeURIComponent(g.id)}`);
                            }}
                            className={cn(
                              'w-full px-4 py-2.5 text-left text-sm transition-colors truncate',
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

        {/* Right: Sprache, Theme, Burger */}
        <div className="flex items-center gap-0.5">
          {/* Sprach-Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setLangOpen((o) => !o)}
              className="h-9 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent inline-flex items-center gap-1 transition-colors"
              aria-haspopup="listbox"
              aria-expanded={langOpen}
              aria-label={tTopbar('language')}
            >
              {LOCALES.find((l) => l.value === locale)?.label ?? locale.slice(0, 2).toUpperCase()}
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {langOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setLangOpen(false)} aria-hidden />
                <ul
                  role="listbox"
                  className="absolute right-0 top-full z-50 mt-1.5 min-w-[72px] rounded-xl border border-border bg-popover py-1 shadow-lg"
                >
                  {LOCALES.map((loc) => (
                    <li key={loc.value} role="option" aria-selected={locale === loc.value}>
                      <button
                        type="button"
                        onClick={() => handleLocaleChange(loc.value)}
                        className={cn(
                          'w-full px-4 py-2 text-left text-sm transition-colors',
                          locale === loc.value
                            ? 'bg-accent text-accent-foreground font-semibold'
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

          {/* Burger button (nur eingeloggt) */}
          {isLoggedIn && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setBurgerOpen((o) => !o)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label={burgerOpen ? 'Menü schließen' : 'Menü öffnen'}
                aria-expanded={burgerOpen}
                aria-haspopup="menu"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {burgerOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={closeBurger} aria-hidden />
                  <div
                    className="absolute right-0 top-full z-50 mt-1.5 w-[280px] rounded-xl border border-border bg-popover p-2 shadow-lg"
                    role="menu"
                    aria-label="Navigation"
                  >
                    <nav className="space-y-0.5">
                      <Link
                        href={`/${locale}/dashboard`}
                        onClick={closeBurger}
                        className={cn(
                          'rounded-lg px-3 py-2.5 text-sm font-medium flex items-center gap-3 transition-colors min-h-[42px]',
                          pathname?.includes('/dashboard')
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        )}
                      >
                        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        Dashboard
                      </Link>

                      <Link
                        href={`/${locale}/profile`}
                        onClick={closeBurger}
                        className={cn(
                          'rounded-lg px-3 py-2.5 text-sm font-medium flex items-center gap-3 transition-colors min-h-[42px]',
                          pathname?.includes('/profile')
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                        )}
                      >
                        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        {t('myProfile')}
                      </Link>

                      {showGuildManagement && (
                        <Link
                          href={`/${locale}/guilds`}
                          onClick={closeBurger}
                          className={cn(
                            'rounded-lg px-3 py-2.5 text-sm font-medium flex items-center gap-3 transition-colors min-h-[42px]',
                            pathname?.includes('/guilds')
                              ? 'bg-accent text-foreground'
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                          )}
                        >
                          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          {t('guildManagement')}
                        </Link>
                      )}

                      {discordBotInviteEnabled ? (
                        <a
                          href={botInviteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={closeBurger}
                          className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-3 transition-colors min-h-[42px]"
                        >
                          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          {t('discordBotInvite')}
                        </a>
                      ) : (
                        <span
                          className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground/40 cursor-not-allowed flex items-center gap-3 min-h-[42px]"
                          aria-disabled="true"
                        >
                          <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                          </svg>
                          {t('discordBotInvite')}
                        </span>
                      )}

                      {isAdmin && (
                        <>
                          <div className="my-1 h-px bg-border" />
                          <Link
                            href={`/${locale}/admin`}
                            onClick={closeBurger}
                            className="rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-3 transition-colors min-h-[42px]"
                          >
                            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {t('admin')}
                          </Link>
                        </>
                      )}
                    </nav>

                    <div className="my-2 h-px bg-border" />

                    <div className="flex flex-wrap gap-1.5 px-1 pb-1">
                      <Link
                        href="#"
                        onClick={closeBurger}
                        className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        Impressum
                      </Link>
                      <Link
                        href="#"
                        onClick={closeBurger}
                        className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        Datenschutz
                      </Link>
                      <Link
                        href="#"
                        onClick={closeBurger}
                        className="rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      >
                        Cookies
                      </Link>
                    </div>

                    <div className="mt-1 border-t border-border pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          closeBurger();
                          void signOut({ callbackUrl: `/${locale}` });
                        }}
                        className="w-full rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent flex items-center gap-3 transition-colors"
                      >
                        <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        {t('logout')}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </header>
    </>
  );
}
