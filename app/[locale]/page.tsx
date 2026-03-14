import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getLocale } from 'next-intl/server';
import { authOptions } from '@/lib/auth';
import { getAppConfig } from '@/lib/app-config';
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

  const config = await getAppConfig();
  return (
    <LandingPage
      error={error}
      discordBotInviteEnabled={config.discordBotInviteEnabled}
      maintenanceMode={config.maintenanceMode}
      statusMessage={config.statusMessage}
    />
  );
}
