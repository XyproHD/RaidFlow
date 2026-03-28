import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getLocale } from 'next-intl/server';
import { authOptions } from '@/lib/auth';
import { getAppConfig, DEFAULT_APP_CONFIG_STATE } from '@/lib/app-config';
import { LandingPage } from '@/components/landing-page';

/** Startseite: Nicht eingeloggt → Landing; eingeloggt → Redirect zu Dashboard. */
export default async function HomePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const session = await getServerSession(authOptions);
  const locale = await getLocale();
  const { error } = searchParams;

  if (session) {
    redirect(`/${locale}/dashboard`);
  }

  let config = DEFAULT_APP_CONFIG_STATE;
  try {
    config = await getAppConfig();
  } catch (e) {
    console.error('[HomePage] getAppConfig:', e);
  }
  return (
    <LandingPage
      error={error}
      discordBotInviteEnabled={config.discordBotInviteEnabled}
      maintenanceMode={config.maintenanceMode}
      statusMessage={config.statusMessage}
    />
  );
}
