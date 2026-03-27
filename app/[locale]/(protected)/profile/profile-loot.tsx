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
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse border border-border min-w-[280px]">
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
                <td className="border border-border p-2">{l.guildName}</td>
                <td className="border border-border p-2">{l.dungeonName}</td>
                <td className="border border-border p-2">{formatDate(l.receivedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="mt-3">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="rounded border border-input bg-background px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            {loading ? t('loading') : t('loadMoreLoot')}
          </button>
        </div>
      )}
    </>
  );
}
