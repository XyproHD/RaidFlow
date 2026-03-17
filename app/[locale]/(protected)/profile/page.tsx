import { getTranslations, getLocale } from 'next-intl/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getGuildsForUser } from '@/lib/user-guilds';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { expandRaidTimeSlot } from '@/lib/profile-constants';
import { getSpecByDisplayName } from '@/lib/wow-tbc-classes';
import { ProfileRaidTimes } from './profile-raid-times';
import { ProfileCharacters } from './profile-characters';
import { ProfileLoot } from './profile-loot';

export const revalidate = 60;
const LOOT_PAGE_SIZE = 20;

/**
 * Mein Profil (UI 4.1): Raidzeiten (AvailabilityGrid), Charakterliste, Raidstatistik, Loottabelle.
 * Theme wird in der Topbar umgestellt und dort gespeichert.
 */
export default async function ProfilePage() {
  try {
    const [t, locale, session] = await Promise.all([
      getTranslations('profile'),
      getLocale(),
      getServerSession(authOptions),
    ]);
    const userId = await getEffectiveUserId(session as { userId?: string; discordId?: string } | null);
    const discordId = (session as { discordId?: string } | null)?.discordId;

    if (!userId) {
      const hasSession = !!session && typeof session === 'object';
      return (
        <div className="p-6 md:p-8">
          <h1 className="text-2xl font-bold text-foreground mb-4">{t('title')}</h1>
          {hasSession ? (
            <p className="text-muted-foreground">
              Sitzung konnte nicht zugeordnet werden. Bitte melde dich ab und erneut an.
            </p>
          ) : (
            <p className="text-muted-foreground">{t('title')}</p>
          )}
        </div>
      );
    }

    const [raidTimes, characters, guilds, completions, loot] = await Promise.all([
      prisma.rfRaidTimePreference.findMany({
        where: { userId },
        orderBy: [{ weekday: 'asc' }, { timeSlot: 'asc' }],
      }),
      prisma.rfCharacter.findMany({
        where: { userId },
        include: { guild: { select: { id: true, name: true } } },
        orderBy: { name: 'asc' },
      }),
      discordId ? getGuildsForUser(userId, discordId) : Promise.resolve([]),
      prisma.rfRaidCompletion.findMany({
        where: { userId },
        include: {
          raid: {
            select: {
              guildId: true,
              dungeonId: true,
              guild: { select: { name: true } },
              dungeon: { select: { name: true } },
            },
          },
        },
      }),
      Promise.all([
        prisma.rfLoot.findMany({
          where: { userId },
          include: {
            guild: { select: { name: true } },
            dungeon: { select: { name: true } },
            character: { select: { name: true } },
          },
          orderBy: { receivedAt: 'desc' },
          take: LOOT_PAGE_SIZE,
        }),
        prisma.rfLoot.count({ where: { userId } }),
      ]),
    ]);

    const statsMap = new Map<
      string,
      { guildId: string; guildName: string; dungeonId: string; dungeonName: string; participationCount: number }
    >();
    for (const c of completions) {
      const key = `${c.raid.guildId}:${c.raid.dungeonId}`;
      const add = Number(c.participationCounter);
      const cur = statsMap.get(key);
      if (cur) cur.participationCount += add;
      else
        statsMap.set(key, {
          guildId: c.raid.guildId,
          guildName: c.raid.guild.name,
          dungeonId: c.raid.dungeonId,
          dungeonName: c.raid.dungeon.name,
          participationCount: add,
        });
    }
    const stats = Array.from(statsMap.values()).sort(
      (a, b) => a.guildName.localeCompare(b.guildName) || a.dungeonName.localeCompare(b.dungeonName)
    );

    const [lootFirstPage, lootTotalCount] = loot;
    const initialLoot = lootFirstPage.map((l) => ({
      id: l.id,
      itemRef: l.itemRef,
      receivedAt: l.receivedAt.toISOString(),
      guildName: l.guild.name,
      dungeonName: l.dungeon.name,
    }));

    const raidTimeRows = raidTimes.flatMap((r) =>
      expandRaidTimeSlot(r.timeSlot).map((timeSlot) => ({
        id: r.id,
        weekday: r.weekday,
        timeSlot,
        preference: r.preference,
        weekFocus: r.weekFocus,
      }))
    );

    const characterRows = characters.map((c) => {
      const specInfo = getSpecByDisplayName(c.mainSpec);
      return {
        id: c.id,
        name: c.name,
        guildId: c.guildId,
        guildName: c.guild?.name ?? null,
        mainSpec: c.mainSpec,
        offSpec: c.offSpec,
        isMain: c.isMain,
        classId: specInfo?.classId ?? null,
      };
    });

    const guildOptions = guilds.map((g) => ({ id: g.id, name: g.name }));

    return (
      <div className="p-6 md:p-8 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>

        {/* 4.1 Raidzeiten-Block: Outlook-artiges Grid, Breite begrenzt */}
        <ProfileRaidTimes initialData={raidTimeRows} />

        {/* 4.1 Charakterliste: Modal Anlegen, Karten mit Bearbeiten inline, Main/Twink je Gilde */}
        <ProfileCharacters initialData={characterRows} guilds={guildOptions} />

        {/* 4.1 Raidstatistik: Teilnahmen je Dungeon und Gilde */}
        <section className="mb-8" aria-labelledby="raid-stats-heading">
          <h2 id="raid-stats-heading" className="text-lg font-semibold text-foreground mb-2">
            {t('raidStats')}
          </h2>
          <p className="text-muted-foreground text-sm mb-4">{t('raidStatsDescription')}</p>
          {stats.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('noStats')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse border border-border min-w-[280px]">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="border border-border p-2 text-left">{t('guild')}</th>
                    <th className="border border-border p-2 text-left">{t('dungeon')}</th>
                    <th className="border border-border p-2 text-right">{t('participationCount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={`${s.guildId}-${s.dungeonId}`}>
                      <td className="border border-border p-2">{s.guildName}</td>
                      <td className="border border-border p-2">{s.dungeonName}</td>
                      <td className="border border-border p-2 text-right">{s.participationCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 4.1 Loottabelle: Erhaltener Loot je Gilde je Dungeon (Pagination + Locale) */}
        <section aria-labelledby="loot-heading">
          <h2 id="loot-heading" className="text-lg font-semibold text-foreground mb-2">
            {t('lootTable')}
          </h2>
          <p className="text-muted-foreground text-sm mb-4">{t('lootTableDescription')}</p>
          <ProfileLoot
            initialLoot={initialLoot}
            totalCount={lootTotalCount}
            locale={locale}
            pageSize={LOOT_PAGE_SIZE}
          />
        </section>
      </div>
    );
  } catch (err) {
    console.error('[ProfilePage]', err);
    return (
      <div className="p-6 md:p-8">
        <p className="text-destructive">Fehler beim Laden des Profils. Bitte später erneut versuchen.</p>
      </div>
    );
  }
}
