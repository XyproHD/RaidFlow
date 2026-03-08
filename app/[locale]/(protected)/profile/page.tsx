import { useTranslations } from 'next-intl';

export default function ProfilePage() {
  const t = useTranslations('profile');

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>
      <p className="text-muted-foreground">Raidzeiten, Charaktere, Raidstatistik und Loot (folgen in Phase 3).</p>
    </div>
  );
}
