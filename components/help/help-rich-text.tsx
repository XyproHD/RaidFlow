import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const chipBase =
  'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.8125rem] font-medium align-middle leading-snug';

export function HelpCmd({ children }: { children: ReactNode }) {
  return (
    <code
      className={cn(
        chipBase,
        'font-mono bg-primary/10 text-primary border-primary/25 shadow-sm'
      )}
    >
      {children}
    </code>
  );
}

export function HelpBtn({ children }: { children: ReactNode }) {
  return (
    <span
      className={cn(
        chipBase,
        'bg-secondary text-secondary-foreground border-border shadow-sm'
      )}
    >
      {children}
    </span>
  );
}

export function HelpRole({ children }: { children: ReactNode }) {
  return (
    <span
      className={cn(
        chipBase,
        'bg-amber-500/15 text-amber-900 dark:text-amber-200 border-amber-500/30'
      )}
    >
      {children}
    </span>
  );
}

export function HelpNav({ children }: { children: ReactNode }) {
  return (
    <span
      className={cn(
        chipBase,
        'bg-accent text-accent-foreground border-border'
      )}
    >
      {children}
    </span>
  );
}

export function getHelpRichComponents() {
  return {
    cmd: (chunks: ReactNode) => <HelpCmd>{chunks}</HelpCmd>,
    btn: (chunks: ReactNode) => <HelpBtn>{chunks}</HelpBtn>,
    role: (chunks: ReactNode) => <HelpRole>{chunks}</HelpRole>,
    nav: (chunks: ReactNode) => <HelpNav>{chunks}</HelpNav>,
  };
}
