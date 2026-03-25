'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export function CharacterGearscoreBadge({
  characterId,
  hasBattlenet,
  gearScore,
  onUpdated,
}: {
  characterId: string;
  hasBattlenet?: boolean;
  gearScore?: number | null;
  onUpdated?: (nextStored: number) => void;
}) {
  const t = useTranslations('profile');
  const [loading, setLoading] = useState(false);

  if (!hasBattlenet || !characterId) return null;
  const value = typeof gearScore === 'number' ? String(gearScore) : '----';

  const refresh = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/user/characters/${encodeURIComponent(characterId)}/gearscore`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = (await res.json().catch(() => ({}))) as {
        currentScore?: number;
        savedHighScore?: number;
        error?: string;
      };
      if (!res.ok) {
        window.alert(data.error || t('gearscoreRefreshError'));
        return;
      }
      if (typeof data.savedHighScore === 'number') onUpdated?.(data.savedHighScore);
      window.alert(
        t('gearscoreCurrentPopup', {
          current: data.currentScore ?? 0,
          high: data.savedHighScore ?? 0,
        })
      );
    } catch {
      window.alert(t('gearscoreRefreshError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void refresh()}
      disabled={loading}
      className="shrink-0 rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground disabled:opacity-60"
      title={t('gearscoreBadgeTitle')}
    >
      {loading ? t('gearscoreRefreshLoading') : `GS: ${value}`}
    </button>
  );
}
