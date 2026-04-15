import { getTranslations, getLocale } from 'next-intl/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getGuildsForUserCached } from '@/lib/user-guilds';
import { getEffectiveUserId } from '@/lib/get-effective-user-id';
import { expandRaidTimeSlot } from '@/lib/profile-constants';
import { characterToClientDto } from '@/lib/character-api-dto';
import { findManyRfCharactersForProfile } from '@/lib/rf-character-gear-score-compat';
import { ProfilePageTabs } from './profile-page-tabs';

export const revalidate = 60;
const LOOT_PAGE_SIZE = 20;

/**
 * Mein Profil: Tabs Charaktere, Raidzeiten, Statistik (Teilnahmen + Loot).
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

    const guilds = await getGuildsForUserCached(userId, discordId ?? null);

    // Charakter-Gilden-Zuordnung bereinigen: Wenn User nicht mehr in der Gilde ist / keine Rechte hat,
    // wird guildId entfernt (und isMain zurückgesetzt). Neue Zuweisung erfolgt über "Bearbeiten".
    {
      const allowedGuildIds = guilds.map((g) => g.id);
      if (allowedGuildIds.length > 0) {
        await prisma.rfCharacter.updateMany({
          where: { userId, guildId: { not: null, notIn: allowedGuildIds } },
          data: { guildId: null, isMain: false, guildDiscordDisplayName: null },
        });
      } else {
        // Leere Liste kann bei transienten Discord/DB-Problemen vorkommen (Prod > Last als Preview).
        // Alle Chars leeren nur, wenn die DB bestätigt, dass wirklich keine rf_user_guild mehr existiert
        // (nach erfolgreichem Sync wären die Zeilen sonst weg).
        const userGuildRowCount = await prisma.rfUserGuild.count({ where: { userId } });
        if (userGuildRowCount === 0) {
          await prisma.rfCharacter.updateMany({
            where: { userId, guildId: { not: null } },
            data: { guildId: null, isMain: false, guildDiscordDisplayName: null },
          });
        }
      }
    }

    const [raidTimes, characters, completions, loot] = await Promise.all([
      prisma.rfRaidTimePreference.findMany({
        where: { userId },
        orderBy: [{ weekday: 'asc' }, { timeSlot: 'asc' }],
      }),
      findManyRfCharactersForProfile(userId),
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

    const characterRows = characters.map((c) => characterToClientDto(c));

    const guildOptions = guilds.map((g) => ({
      id: g.id,
      name: g.name,
      battlenetRealmId: g.battlenetRealmId,
    }));

    return (
      <div className="p-6 md:p-8 max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground mb-6">{t('title')}</h1>

        <ProfilePageTabs
          raidTimeRows={raidTimeRows}
          characterRows={characterRows}
          guildOptions={guildOptions}
          stats={stats}
          initialLoot={initialLoot}
          lootTotalCount={lootTotalCount}
          locale={locale}
          lootPageSize={LOOT_PAGE_SIZE}
        />
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
