import { useTranslations } from 'next-intl';

export default function HomePage() {
  const t = useTranslations('home');
  const tCommon = useTranslations('common');

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-background">
      <h1 className="text-3xl font-bold text-foreground mb-2">
        {tCommon('appName')}
      </h1>
      <p className="text-muted-foreground">{t('welcome')}</p>
    </main>
  );
}
