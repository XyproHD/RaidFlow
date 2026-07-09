import { getTranslations } from 'next-intl/server';

export default async function DatenschutzPage() {
  const t = await getTranslations('footer');

  return (
    <main className="min-h-screen bg-background p-6 md:p-8 page-container">
      <h1 className="text-2xl font-bold text-foreground mb-4">{t('privacy')}</h1>
      <p className="text-muted-foreground">{t('underConstruction')}</p>
    </main>
  );
}
