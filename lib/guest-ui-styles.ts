import { cn } from '@/lib/utils';

/** Lila Hervorhebung für Gast-Anmeldungen (Light/Dark mit gutem Kontrast). */
export const guestSignupSurfaceClass = cn(
  'border-violet-500/55 bg-violet-500/[0.08]',
  'dark:border-violet-400/45 dark:bg-violet-950/35'
);

export const guestSignupRowClass = cn(guestSignupSurfaceClass, 'rounded-md');

export const guestSignupBadgeClass = cn(
  'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
  'bg-violet-600/15 text-violet-800 border border-violet-500/40',
  'dark:bg-violet-400/15 dark:text-violet-200 dark:border-violet-400/35'
);
