import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { cn } from '@/lib/utils';

type SiteFooterProps = {
  className?: string;
};

export async function SiteFooter({ className }: SiteFooterProps) {
  const locale = await getLocale();
  const tFooter = await getTranslations('footer');
  const tHelp = await getTranslations('help');

  return (
    <footer
      className={cn(
        'shrink-0 border-t border-border bg-background px-4 py-3 text-xs text-muted-foreground',
        className
      )}
    >
      <div className="flex flex-col items-center justify-center gap-2 sm:flex-row sm:flex-wrap sm:gap-x-6 sm:gap-y-1">
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1">
          <Link href={`/${locale}/help`} className="hover:text-foreground transition-colors">
            {tHelp('menuTitle')}
          </Link>
          <Link href={`/${locale}/impressum`} className="hover:text-foreground transition-colors">
            {tFooter('imprint')}
          </Link>
          <Link href={`/${locale}/datenschutz`} className="hover:text-foreground transition-colors">
            {tFooter('privacy')}
          </Link>
        </nav>
        <span className="text-muted-foreground/80">{tFooter('copyright')}</span>
      </div>
    </footer>
  );
}
