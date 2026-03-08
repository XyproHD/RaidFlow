'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

/** Switch in der Topbar: Aus = Light, An = Dark. Speichert per Cookie und optional User-Profil (API). */
export function ThemeSwitch({ className }: { className?: string }) {
  const t = useTranslations('topbar');
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = (resolvedTheme ?? theme ?? 'dark') === 'dark';

  const handleToggle = () => {
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    fetch('/api/user/theme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: next }),
    }).catch(() => {});
  };

  if (!mounted) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-base', className)} aria-hidden>
        <span aria-hidden>☀️</span>
        <span className="h-6 w-9 rounded-full bg-muted" aria-hidden />
        <span aria-hidden>🌙</span>
      </span>
    );
  }

  return (
    <div className={cn('inline-flex items-center gap-1.5 text-base', className)} role="group" aria-label={t('themeLabel')}>
      <span className="text-muted-foreground" aria-hidden>☀️</span>
      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label={isDark ? t('themeDark') : t('themeLight')}
        onClick={handleToggle}
        className={cn(
          'relative inline-flex h-6 w-9 shrink-0 cursor-pointer rounded-full border border-input transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          isDark ? 'bg-primary' : 'bg-muted'
        )}
      >
        <span
          className={cn(
            'pointer-events-none block h-5 w-5 rounded-full bg-background shadow ring-0 transition-transform',
            isDark ? 'translate-x-3.5' : 'translate-x-0.5'
          )}
          style={{ marginTop: 2 }}
        />
      </button>
      <span className="text-muted-foreground" aria-hidden>🌙</span>
    </div>
  );
}
