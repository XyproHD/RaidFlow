import type { Metadata } from 'next';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/require-owner';
import { collectOwnerDiagnostics } from '@/lib/owner-diagnostics';
import { OwnerDiagnosticsView } from './diagnostics-view';

export const metadata: Metadata = {
  title: 'Systemdiagnose',
  robots: { index: false, follow: false },
};

/**
 * Nur für OWNER_DISCORD_ID. Nicht in der Hauptnavigation verlinkt; Einstieg über Admin → Owner-Link.
 */
export default async function OwnerSysdiagPage() {
  const locale = await getLocale();
  const owner = await requireOwner();
  if (!owner) {
    redirect(`/${locale}/admin`);
  }

  const t = await getTranslations('ownerDiagnostics');
  const data = await collectOwnerDiagnostics();

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto">
      <p className="text-sm text-muted-foreground mb-4">
        <Link href={`/${locale}/admin`} className="underline hover:text-foreground">
          {t('backToAdmin')}
        </Link>
        {' · '}
        <a href={`/${locale}/admin/sysdiag`} className="underline hover:text-foreground">
          {t('refresh')}
        </a>
      </p>
      <h1 className="text-2xl font-bold text-foreground mb-2">{t('title')}</h1>
      <p className="text-sm text-muted-foreground mb-8">{t('subtitle')}</p>
      <OwnerDiagnosticsView data={data} />
    </div>
  );
}
