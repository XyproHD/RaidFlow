import { getTranslations } from 'next-intl/server';
import { requireAdmin } from '@/lib/require-admin';
import { AdminContent } from './admin-content';

/**
 * Admin – nur für Application-Admins (Owner oder in AppAdmin).
 * Gilden löschen, Whitelist/Blacklist, Admins verwalten.
 */
export default async function AdminPage() {
  const t = await getTranslations('admin');
  const admin = await requireAdmin();

  if (!admin) {
    return (
      <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>
        <p className="text-muted-foreground">{t('forbidden')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>
      <AdminContent />
    </div>
  );
}
