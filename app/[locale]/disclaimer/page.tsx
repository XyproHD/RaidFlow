import { getTranslations } from 'next-intl/server';

/** Platzhalter Disclaimer (Phase 1). */
export default async function DisclaimerPage() {
  const t = await getTranslations('footer');

  return (
    <main className="min-h-screen bg-background p-6 md:p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-4">{t('disclaimer')}</h1>
      <p className="text-muted-foreground">Platzhalter – Inhalt folgt.</p>
    </main>
  );
}
