import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getGuildsForUser, getRaidsForUser } from '@/lib/user-guilds';
import { getLocale } from 'next-intl/server';

/** Dashboard: Gilden- und Raid-Übersicht (Phase 3: echte Daten, nur Gilden des Users). */
export default async function DashboardPage() {
  const t = await getTranslations('dashboard');
  const tShell = await getTranslations('shell');
  const locale = await getLocale();
  const session = await getServerSession(authOptions);
  const userId = (session as { userId?: string } | null)?.userId;
  const discordId = (session as { discordId?: string } | null)?.discordId;

  let guilds: Awaited<ReturnType<typeof getGuildsForUser>> = [];
  let raids: Awaited<ReturnType<typeof getRaidsForUser>> = [];
  try {
    guilds = userId && discordId ? await getGuildsForUser(userId, discordId) : [];
    raids = await getRaidsForUser(guilds);
  } catch (e) {
    console.error('[Dashboard]', e);
  }

  const roleKey: Record<string, string> = {
    guildmaster: t('roleGuildmaster'),
    raidleader: t('roleRaidleader'),
    raider: t('roleRaider'),
  };

  function formatDate(d: Date) {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(d));
  }

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>

      <section className="mb-8" aria-labelledby="guilds-heading">
        <h2 id="guilds-heading" className="text-lg font-semibold text-foreground mb-3">
          {t('guilds')}
        </h2>
        {guilds.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('guildsEmpty')}</p>
        ) : (
          <ul className="space-y-2">
            {guilds.map((g) => (
              <li
                key={g.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card"
              >
                <span className="font-medium text-foreground">{g.name}</span>
                <span
                  className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary"
                  aria-label={roleKey[g.role]}
                >
                  {roleKey[g.role]}
                </span>
                {g.role === 'guildmaster' && (
                  <Link
                    href={`/${locale}/guilds?guild=${encodeURIComponent(g.id)}`}
                    className="text-sm text-primary hover:underline"
                  >
                    {tShell('guildManagement')}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="raids-heading">
        <h2 id="raids-heading" className="text-lg font-semibold text-foreground mb-3">
          {t('raids')}
        </h2>
        {raids.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('raidsEmpty')}</p>
        ) : (
          <ul className="space-y-2">
            {raids.map((r) => (
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
    </div>
  );
}
