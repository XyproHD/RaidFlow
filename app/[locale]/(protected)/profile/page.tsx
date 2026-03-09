import { getTranslations } from 'next-intl/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getGuildsForUser } from '@/lib/user-guilds';
import { ProfileRaidTimes } from './profile-raid-times';
import { ProfileCharacters } from './profile-characters';

export const dynamic = 'force-dynamic';

/** Mein Profil: Raidzeiten, Charaktere, Raidstatistik, Loot. Theme in Topbar. */
export default async function ProfilePage() {
  const t = await getTranslations('profile');
  const session = await getServerSession(authOptions);
  const userId = (session as { userId?: string } | null)?.userId;
  const discordId = (session as { discordId?: string } | null)?.discordId;

  if (!userId) {
    return (
      <div className="p-6 md:p-8">
        <p className="text-muted-foreground">{t('title')}</p>
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
    prisma.rfLoot.findMany({
      where: { userId },
      include: {
        guild: { select: { name: true } },
        dungeon: { select: { name: true } },
        character: { select: { name: true } },
      },
      orderBy: { receivedAt: 'desc' },
    }),
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

  const TIME_SLOTS_30MIN = [
    '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30',
    '20:00', '20:30', '21:00', '21:30', '22:00', '22:30', '23:00', '23:30',
    '00:00', '00:30', '01:00', '01:30', '02:00', '02:30', '03:00',
  ];
  const expandSlot = (slot: string): string[] => {
    if (TIME_SLOTS_30MIN.includes(slot as (typeof TIME_SLOTS_30MIN)[number])) return [slot];
    const match = slot.match(/^(\d{1,2})-(\d{1,2})$/);
    if (!match) return [];
    const [, start, end] = match;
    const startIdx = TIME_SLOTS_30MIN.findIndex((s) => s.startsWith(start + ':'));
    const endIdx = end === '03'
      ? TIME_SLOTS_30MIN.length
      : TIME_SLOTS_30MIN.findIndex((s) => s.startsWith(end + ':'));
    if (startIdx === -1 || endIdx === -1) return [slot];
    return TIME_SLOTS_30MIN.slice(startIdx, endIdx);
  };
  const raidTimeRows = raidTimes.flatMap((r) =>
    expandSlot(r.timeSlot).map((timeSlot) => ({
      id: r.id,
      weekday: r.weekday,
      timeSlot,
      preference: r.preference,
      weekFocus: r.weekFocus,
    }))
  );

  const characterRows = characters.map((c) => ({
    id: c.id,
    name: c.name,
    guildId: c.guildId,
    guildName: c.guild?.name ?? null,
    mainSpec: c.mainSpec,
    offSpec: c.offSpec,
  }));

  const guildOptions = guilds.map((g) => ({ id: g.id, name: g.name }));

  return (
    <div className="p-6 md:p-8">
      <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>
      <p className="text-muted-foreground text-sm mb-6">{t('themeDescription')}</p>

      <ProfileRaidTimes initialData={raidTimeRows} />
      <ProfileCharacters initialData={characterRows} guilds={guildOptions} />

      <section className="mb-8" aria-labelledby="raid-stats-heading">
        <h2 id="raid-stats-heading" className="text-lg font-semibold text-foreground mb-2">
          {t('raidStats')}
        </h2>
        <p className="text-muted-foreground text-sm mb-4">{t('raidStatsDescription')}</p>
        {stats.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('noStats')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse border border-border">
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

      <section aria-labelledby="loot-heading">
        <h2 id="loot-heading" className="text-lg font-semibold text-foreground mb-2">
          {t('lootTable')}
        </h2>
        <p className="text-muted-foreground text-sm mb-4">{t('lootTableDescription')}</p>
        {loot.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('noLoot')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse border border-border">
              <thead>
                <tr className="bg-muted/50">
                  <th className="border border-border p-2 text-left">{t('itemRef')}</th>
                  <th className="border border-border p-2 text-left">{t('guild')}</th>
                  <th className="border border-border p-2 text-left">{t('dungeon')}</th>
                  <th className="border border-border p-2 text-left">{t('receivedAt')}</th>
                </tr>
              </thead>
              <tbody>
                {loot.map((l) => (
                  <tr key={l.id}>
                    <td className="border border-border p-2">{l.itemRef}</td>
                    <td className="border border-border p-2">{l.guild.name}</td>
                    <td className="border border-border p-2">{l.dungeon.name}</td>
                    <td className="border border-border p-2">
                      {new Date(l.receivedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
