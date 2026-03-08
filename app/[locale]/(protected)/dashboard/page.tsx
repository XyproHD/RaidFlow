import { getTranslations } from 'next-intl/server';

/** Dashboard: Gilden- und Raid-Übersicht (Phase 1: Platzhalter). */
export default async function DashboardPage() {
  const t = await getTranslations('dashboard');

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>

      <section className="mb-8" aria-labelledby="guilds-heading">
        <h2 id="guilds-heading" className="text-lg font-semibold text-foreground mb-3">
          {t('guilds')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('guildsEmpty')}</p>
      </section>

      <section aria-labelledby="raids-heading">
        <h2 id="raids-heading" className="text-lg font-semibold text-foreground mb-3">
          {t('raids')}
        </h2>
        <p className="text-muted-foreground text-sm">{t('raidsEmpty')}</p>
      </section>
    </div>
  );
}
