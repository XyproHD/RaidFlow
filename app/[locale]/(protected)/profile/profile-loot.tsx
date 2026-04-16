'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';

export type LootRow = {
  id: string;
  itemRef: string;
  receivedAt: string;
  guildName: string;
  dungeonName: string;
};

export function ProfileLoot({
  initialLoot,
  totalCount,
  locale,
  pageSize = 20,
}: {
  initialLoot: LootRow[];
  totalCount: number;
  locale: string;
  pageSize?: number;
}) {
  const t = useTranslations('profile');
  const [loot, setLoot] = useState(initialLoot);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const hasMore = loot.length < totalCount;

  const loadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/user/loot?page=${page + 1}&limit=${pageSize}`,
        { credentials: 'include' }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.loot)) {
        setLoot((prev) => [...prev, ...data.loot]);
        setPage((p) => p + 1);
      }
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, hasMore, loading]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString(locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  if (loot.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('noLoot')}</p>;
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-sm min-w-[320px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('itemRef')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('guild')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('dungeon')}</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('receivedAt')}</th>
            </tr>
          </thead>
          <tbody>
            {loot.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 text-sm font-medium text-foreground">{l.itemRef}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{l.guildName}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{l.dungeonName}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground tabular-nums">{formatDate(l.receivedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="mt-4">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            {loading ? t('loading') : t('loadMoreLoot')}
          </button>
        </div>
      )}
    </>
  );
}
