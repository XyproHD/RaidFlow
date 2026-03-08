import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { getLocale } from 'next-intl/server';
import { authOptions } from '@/lib/auth';

/** Geschützter Bereich: Nur für eingeloggte Nutzer. Topbar kommt aus dem Locale-Layout. */
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

  return <>{children}</>;
}
