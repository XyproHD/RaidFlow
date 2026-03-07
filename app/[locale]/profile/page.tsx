import { useTranslations } from 'next-intl';
import { ThemeToggle } from '@/components/theme-toggle';

export default function ProfilePage() {
  const t = useTranslations('profile');

  return (
    <main className="min-h-screen bg-background p-6 md:p-8">
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>

      <section className="mb-8" aria-labelledby="theme-heading">
        <h2 id="theme-heading" className="text-lg font-semibold text-foreground mb-2">
          {t('theme')}
        </h2>
        <p className="text-muted-foreground text-sm mb-3">{t('themeDescription')}</p>
        <ThemeToggle />
      </section>
    </main>
  );
}
