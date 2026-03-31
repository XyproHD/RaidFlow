import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getServerSession } from 'next-auth';
import { getLocale } from 'next-intl/server';
import { authOptions } from '@/lib/auth';
import { requireAdmin, AdminDatabaseError } from '@/lib/require-admin';
import { getAppConfig, DEFAULT_APP_CONFIG_STATE, type AppConfigState } from '@/lib/app-config';

/** Geschützter Bereich: Nur für eingeloggte Nutzer. Bei Wartungsmodus sehen Nicht-Admins nur die Wartungsmeldung. */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  const locale = await getLocale();

  if (!session?.discordId) {
    redirect(`/${locale}`);
  }

  let admin: Awaited<ReturnType<typeof requireAdmin>> = null;
  let config: AppConfigState = DEFAULT_APP_CONFIG_STATE;
  try {
    config = await getAppConfig();
  } catch (e) {
    console.error('[ProtectedLayout] getAppConfig:', e);
  }
  try {
    admin = await requireAdmin();
  } catch (e) {
    if (e instanceof AdminDatabaseError) {
      console.error('[ProtectedLayout] requireAdmin (DB):', e);
    } else {
      console.error('[ProtectedLayout] requireAdmin:', e);
    }
  }
  if (config.maintenanceMode && !admin) {
    const t = await getTranslations('maintenance');
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-6 py-12 text-center">
        <h2 className="text-2xl font-bold text-foreground mb-4">{t('title')}</h2>
        {config.statusMessage.trim() && (
          <p className="text-muted-foreground max-w-md whitespace-pre-wrap">{config.statusMessage.trim()}</p>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
