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
        className="flex flex-wrap gap-1 rounded-xl bg-muted/50 p-1 mb-6 w-fit border border-border/50"
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
              'px-4 py-2 text-sm font-medium rounded-lg transition-all min-h-[38px]',
              activeTab === id
                ? 'bg-background text-foreground shadow-sm border border-border/60'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
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
          <div className="pb-3 border-b border-border mb-4">
              <h2 id="raid-stats-heading" className="text-base font-semibold text-foreground tracking-tight">
                {t('raidStats')}
              </h2>
              <p className="text-muted-foreground text-sm mt-1">{t('raidStatsDescription')}</p>
            </div>
          {stats.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('noStats')}</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
              <table className="w-full text-sm min-w-[280px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('guild')}</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('dungeon')}</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('participationCount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={`${s.guildId}-${s.dungeonId}`} className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-sm text-foreground">{s.guildName}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{s.dungeonName}</td>
                      <td className="px-4 py-3 text-sm font-bold text-foreground text-right tabular-nums">{s.participationCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="loot-heading">
          <div className="pb-3 border-b border-border mb-4">
            <h2 id="loot-heading" className="text-base font-semibold text-foreground tracking-tight">
              {t('lootTable')}
            </h2>
            <p className="text-muted-foreground text-sm mt-1">{t('lootTableDescription')}</p>
          </div>
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
