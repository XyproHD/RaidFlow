import { getTranslations } from 'next-intl/server';
import { SiteFooter } from '@/components/site-footer';

export default async function ImpressumPage() {
  const t = await getTranslations('footer');

  return (
    <div className="bg-background">
      <main className="page-container p-6 md:p-8">
        <h1 className="mb-4 text-2xl font-bold text-foreground">{t('imprint')}</h1>
        <p className="text-muted-foreground">{t('underConstruction')}</p>
      </main>
      <SiteFooter />
    </div>
  );
}
