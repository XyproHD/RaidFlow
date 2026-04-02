import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { getGuildsForUserCached } from '@/lib/user-guilds';
import { NewRaidWizard } from '@/components/raid-planner/new-raid-wizard';

/**
 * Raidplaner „Neuer Raid“ – nur RaidFlow-Raidleader oder Gildenmeister der Gilde.
 */
export default async function NewRaidPage({
  params,
}: {
  params: Promise<{ locale: string; guildId: string }>;
}) {
  const { locale, guildId } = await params;
  const t = await getTranslations('raidPlanner');
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(
    session as { userId?: string; discordId?: string } | null
  );
  const discordId = (session as { discordId?: string } | null)?.discordId;

  if (!userId) {
    redirect(`/${locale}`);
  }

  const guilds = await getGuildsForUserCached(userId, discordId ?? null);
  const g = guilds.find((x) => x.id === guildId);
  if (!g || (g.role !== 'raidleader' && g.role !== 'guildmaster')) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-4">{t('title')}</h1>
        <p className="text-muted-foreground">{t('forbidden')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>
      <NewRaidWizard guildId={guildId} currentUserId={userId} />
    </div>
  );
}
