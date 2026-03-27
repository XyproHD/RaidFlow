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
        className="block text-sm font-medium text-foreground mb-1"
      >
        {t('selectGuild')}
      </label>
      <select
        id="guild-select"
        className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm"
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
