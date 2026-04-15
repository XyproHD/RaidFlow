'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { ProfileRaidTimes } from './profile-raid-times';
import { ProfileCharacters } from './profile-characters';
import { ProfileLoot } from './profile-loot';

type RaidTimeRow = {
  id: string;
  weekday: string;
  timeSlot: string;
  preference: string;
  weekFocus: string | null;
};

type CharacterRow = {
  id: string;
  name: string;
  guildId: string | null;
  guildName: string | null;
  guildDiscordDisplayName?: string | null;
  gearScore?: number | null;
  mainSpec: string;
  offSpec: string | null;
  isMain: boolean;
  classId?: string | null;
  hasBattlenet?: boolean;
  battlenetRealmSlug?: string | null;
};

type GuildOption = { id: string; name: string; battlenetRealmId?: string | null };

type StatRow = {
  guildId: string;
  guildName: string;
  dungeonId: string;
  dungeonName: string;
  participationCount: number;
};

type LootRow = {
  id: string;
  itemRef: string;
  receivedAt: string;
  guildName: string;
  dungeonName: string;
};

export function ProfilePageTabs({
  raidTimeRows,
  characterRows,
  guildOptions,
  stats,
  initialLoot,
  lootTotalCount,
  locale,
  lootPageSize,
}: {
  raidTimeRows: RaidTimeRow[];
  characterRows: CharacterRow[];
  guildOptions: GuildOption[];
  stats: StatRow[];
  initialLoot: LootRow[];
  lootTotalCount: number;
  locale: string;
  lootPageSize: number;
}) {
  const t = useTranslations('profile');
  const [activeTab, setActiveTab] = useState<'characters' | 'raidTimes' | 'statistics'>('characters');

  return (
    <>
      <div
        role="tablist"
        aria-label={t('title')}
        className="flex flex-wrap gap-1 border-b border-border mb-6"
      >
        {(
          [
            ['characters', t('tabMyCharacters')] as const,
            ['raidTimes', t('tabMyRaidTimes')] as const,
            ['statistics', t('tabMyStatistics')] as const,
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            id={`profile-tab-${id}`}
            aria-controls={`profile-panel-${id}`}
            onClick={() => setActiveTab(id)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium rounded-t-md border-b-2 -mb-px transition-colors min-h-[44px]',
              activeTab === id
                ? 'border-primary text-foreground bg-muted/40'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id="profile-panel-characters"
        aria-labelledby="profile-tab-characters"
        hidden={activeTab !== 'characters'}
        className="space-y-6"
      >
        <ProfileCharacters initialData={characterRows} guilds={guildOptions} />
      </div>

      <div
        role="tabpanel"
        id="profile-panel-raidTimes"
        aria-labelledby="profile-tab-raidTimes"
        hidden={activeTab !== 'raidTimes'}
        className="space-y-6"
      >
        <ProfileRaidTimes initialData={raidTimeRows} />
      </div>

      <div
        role="tabpanel"
        id="profile-panel-statistics"
        aria-labelledby="profile-tab-statistics"
        hidden={activeTab !== 'statistics'}
        className="space-y-8"
      >
        <section className="mb-0" aria-labelledby="raid-stats-heading">
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

        <section aria-labelledby="loot-heading">
          <h2 id="loot-heading" className="text-lg font-semibold text-foreground mb-2">
            {t('lootTable')}
          </h2>
          <p className="text-muted-foreground text-sm mb-4">{t('lootTableDescription')}</p>
          <ProfileLoot
            initialLoot={initialLoot}
            totalCount={lootTotalCount}
            locale={locale}
            pageSize={lootPageSize}
          />
        </section>
      </div>
    </>
  );
}
