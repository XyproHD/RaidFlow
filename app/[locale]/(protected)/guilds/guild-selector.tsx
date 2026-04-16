'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { UserGuildInfo } from '@/lib/user-guilds';

export function GuildSelector({
  guilds,
  selectedId,
}: {
  guilds: UserGuildInfo[];
  selectedId: string;
}) {
  const t = useTranslations('guildManagement');
  const router = useRouter();
  const pathname = usePathname();

  const handleChange = (guildId: string) => {
    const params = new URLSearchParams();
    params.set('guild', guildId);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div className="mb-6">
      <label
        htmlFor="guild-select"
        className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2"
      >
        {t('selectGuild')}
      </label>
      <select
        id="guild-select"
        className="w-full max-w-xs rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        value={selectedId}
        onChange={(e) => handleChange(e.target.value)}
      >
        {guilds.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </div>
  );
}
