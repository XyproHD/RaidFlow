import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { getGuildsForUser, getRaidsForUser } from '@/lib/user-guilds';
import { getLocale } from 'next-intl/server';

type SearchParams = Promise<{ guild?: string }>;

/** Dashboard: Raid-Übersicht gefiltert nach aktiver Gilde (in Topbar). Empty-States bei keiner Gildenmitgliedschaft bzw. ohne Raider-Rechte. */
export default async function DashboardPage(props: { searchParams?: SearchParams }) {
  try {
    const t = await getTranslations('dashboard');
    const locale = await getLocale();
    const session = await getServerSession(authOptions);
    const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
    const discordId = (session as { discordId?: string } | null)?.discordId;

    let guilds: Awaited<ReturnType<typeof getGuildsForUser>> = [];
    let raids: Awaited<ReturnType<typeof getRaidsForUser>> = [];
    try {
      guilds = userId && discordId ? await getGuildsForUser(userId, discordId) : [];
      raids = await getRaidsForUser(guilds);
    } catch (e) {
      console.error('[Dashboard]', e);
    }

    const params = props.searchParams ? await props.searchParams : {};
    const guildParam = params.guild ?? null;
    const selectedGuild = guildParam && guilds.length > 0
      ? guilds.find((g) => g.id === guildParam) ?? guilds[0]
      : guilds[0] ?? null;
    const raidsForGuild = selectedGuild ? raids.filter((r) => r.guildId === selectedGuild.id) : [];

    function formatDate(d: Date) {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(new Date(d));
    }

    return (
      <div className="p-6 md:p-8">
        <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>

        {guilds.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center" role="status" aria-live="polite">
            <span className="text-5xl mb-4" aria-hidden="true">😢</span>
            <p className="text-muted-foreground">{t('noGuildMembership')}</p>
          </div>
        )}

        {guilds.length > 0 && selectedGuild?.role === 'member' && (
          <div className="flex flex-col items-center justify-center py-16 text-center" role="status" aria-live="polite">
            <span className="text-5xl mb-4" aria-hidden="true">😢</span>
            <p className="text-muted-foreground">{t('noRaiderRights')}</p>
          </div>
        )}

        {guilds.length > 0 && selectedGuild && selectedGuild.role !== 'member' && (
          <section aria-labelledby="raids-heading">
            <h2 id="raids-heading" className="text-lg font-semibold text-foreground mb-3">
              {t('raids')}
            </h2>
            {raidsForGuild.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('raidsEmpty')}</p>
            ) : (
              <ul className="space-y-2">
                {raidsForGuild.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3 rounded-lg border border-border bg-card"
              >
                <span className="font-medium text-foreground">{r.name}</span>
                <span className="text-muted-foreground text-sm">{r.dungeonName}</span>
                <span className="text-muted-foreground text-sm">{r.guildName}</span>
                <span className="text-muted-foreground text-sm">
                  {formatDate(r.scheduledAt)}
                </span>
                <span className="text-muted-foreground text-sm">
                  {r.signupCount} / {r.maxPlayers} {t('signups')}
                </span>
                <span className="text-muted-foreground text-sm capitalize">{r.status}</span>
                <div className="flex gap-2 ml-auto">
                  <Link
                    href={`/${locale}/guild/${r.guildId}/raid/${r.id}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {t('raidView')}
                  </Link>
                  {r.canEdit && (
                    <Link
                      href={`/${locale}/guild/${r.guildId}/raid/${r.id}/edit`}
                      className="text-sm text-primary hover:underline"
                    >
                      {t('raidEdit')}
                    </Link>
                  )}
                  <Link
                    href={`/${locale}/guild/${r.guildId}/raid/${r.id}/signup`}
                    className="text-sm text-primary hover:underline"
                  >
                    {t('signupLink')}
                  </Link>
                </div>
              </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    );
  } catch (err) {
    console.error('[DashboardPage]', err);
    return (
      <div className="p-6 md:p-8">
        <p className="text-destructive">Fehler beim Laden des Dashboards. Bitte später erneut versuchen.</p>
      </div>
    );
  }
}
