import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { getGuildsForUser } from '@/lib/user-guilds';
import { GuildSelector } from './guild-selector';
import { GuildManagementContent } from './guild-management-content';

type SearchParams = Promise<{ guild?: string }>;

/**
 * Gildenverwaltung – nur für RaidFlow-Gildenmeister.
 * Zeigt Raidgruppen CRUD, Mitgliederliste mit Gruppenzuteilung, Lese Channels.
 */
export default async function GuildsPage(props: {
  searchParams?: SearchParams;
}) {
  const t = await getTranslations('guildManagement');
  const session = await getServerSession(authOptions);
  const userId = await getEffectiveUserId(
    session as { userId?: string; discordId?: string } | null
  );
  const discordId = (session as { discordId?: string } | null)?.discordId;

  if (!userId || !discordId) {
    redirect('/');
  }

  const allGuilds = await getGuildsForUser(userId, discordId);
  const guildmasterGuilds = allGuilds.filter((g) => g.role === 'guildmaster');

  if (guildmasterGuilds.length === 0) {
    return (
      <div className="p-6 md:p-8">
        <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>
        <p className="text-muted-foreground">{t('forbidden')}</p>
      </div>
    );
  }

  const params = props.searchParams ? await props.searchParams : {};
  const guildParam = params.guild ?? null;
  const selectedGuild =
    guildParam && guildmasterGuilds.some((g) => g.id === guildParam)
      ? guildmasterGuilds.find((g) => g.id === guildParam)!
      : guildmasterGuilds[0]!;

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>

      {guildmasterGuilds.length > 1 && (
        <GuildSelector
          guilds={guildmasterGuilds}
          selectedId={selectedGuild.id}
        />
      )}

      <GuildManagementContent
        guildId={selectedGuild.id}
        discordGuildId={selectedGuild.discordGuildId}
      />
    </div>
  );
}
