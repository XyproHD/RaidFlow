import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getServerSession } from 'next-auth';
import { getLocale } from 'next-intl/server';
import { authOptions } from '@/lib/auth';
import { requireAdmin } from '@/lib/require-admin';
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
    [admin, config] = await Promise.all([requireAdmin(), getAppConfig()]);
  } catch (e) {
    console.error('[ProtectedLayout] requireAdmin/getAppConfig:', e);
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
