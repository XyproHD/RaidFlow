'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type Props = {
  children: React.ReactNode;
  discordName: string | null | undefined;
  className?: string;
};

/**
 * Zeigt den gespeicherten Discord-Anzeigenamen der Gilde: Hover (Desktop) bzw. Tap (schmale Viewports).
 */
export function CharacterDiscordNameHint({ children, discordName, className }: Props) {
  const t = useTranslations('profile');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [open]);

  const label = discordName?.trim();
  if (!label) {
    return <span className={className}>{children}</span>;
  }

  const text = t('discordNameOnGuild', { name: label });

  return (
    <span ref={rootRef} className={cn('group/discHint relative inline-flex max-w-full min-w-0', className)}>
      <button
        type="button"
        aria-label={text}
        className={cn(
          'min-w-0 max-w-full truncate text-left font-[inherit] bg-transparent p-0',
          'max-sm:border-b max-sm:border-dotted max-sm:border-muted-foreground/50 sm:cursor-default',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
        )}
        onClick={(e) => {
          e.stopPropagation();
          if (typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches) {
            setOpen((o) => !o);
          }
        }}
      >
        {children}
      </button>
      <span
        className="pointer-events-none absolute left-0 top-full z-30 mt-1 hidden max-w-[min(100vw-2rem,20rem)] whitespace-normal rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md sm:block sm:opacity-0 sm:transition-opacity sm:duration-150 sm:group-hover/discHint:opacity-100 sm:group-focus-within/discHint:opacity-100"
        role="tooltip"
      >
        {text}
      </span>
      {open && (
        <span
          className="absolute left-0 top-full z-30 mt-1 max-w-[min(100vw-2rem,20rem)] rounded-md border border-border bg-popover px-2 py-1.5 text-xs text-popover-foreground shadow-md sm:hidden"
          role="status"
        >
          {text}
        </span>
      )}
    </span>
  );
}
