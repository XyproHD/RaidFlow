'use client';

import { useTheme } from 'next-themes';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type Theme = 'light' | 'dark';

/** Umschalter für Hell/Dunkel-Modus; speichert per Cookie und optional im User-Profil (API). */
export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations('profile');
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current = (resolvedTheme ?? theme ?? 'light') as Theme;

  const handleChange = (value: Theme) => {
    setTheme(value);
    fetch('/api/user/theme', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme: value }),
    }).catch(() => {
      // Cookie ist bereits gesetzt; API speichert nur bei eingeloggten Usern
    });
  };

  if (!mounted) {
    return (
      <div className={cn('flex gap-2', className)} aria-hidden>
        <span className="rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
          {t('themeLight')}
        </span>
        <span className="rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
          {t('themeDark')}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex gap-2', className)} role="group" aria-label={t('theme')}>
      <button
        type="button"
        onClick={() => handleChange('light')}
        className={cn(
          'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
          current === 'light'
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground'
        )}
      >
        {t('themeLight')}
      </button>
      <button
        type="button"
        onClick={() => handleChange('dark')}
        className={cn(
          'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
          current === 'dark'
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground'
        )}
      >
        {t('themeDark')}
      </button>
    </div>
  );
}
