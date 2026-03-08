import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getLocale } from 'next-intl/server';
import { authOptions } from '@/lib/auth';
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

  return <LandingPage error={error} />;
}
