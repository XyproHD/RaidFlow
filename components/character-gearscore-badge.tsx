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
  const [lastCurrentScore, setLastCurrentScore] = useState<number | null>(null);
  const [lastSavedHighScore, setLastSavedHighScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!hasBattlenet || !characterId) return null;

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
        setError(data.error || t('gearscoreRefreshError'));
        return;
      }
      setError(null);
      setLastCurrentScore(typeof data.currentScore === 'number' ? data.currentScore : null);
      setLastSavedHighScore(typeof data.savedHighScore === 'number' ? data.savedHighScore : null);
      if (typeof data.savedHighScore === 'number') onUpdated?.(data.savedHighScore);
    } catch {
      setError(t('gearscoreRefreshError'));
    } finally {
      setLoading(false);
    }
  };

  const high = typeof lastSavedHighScore === 'number' ? lastSavedHighScore : typeof gearScore === 'number' ? gearScore : null;
  const cur = typeof lastCurrentScore === 'number' ? lastCurrentScore : null;

  const text =
    high != null && cur != null && cur < high
      ? `GS Max: ${high}\nGS Cur: ${cur}`
      : `GS: ${high != null ? high : '----'}`;

  return (
    <button
      type="button"
      onClick={() => void refresh()}
      disabled={loading}
      className="shrink-0 rounded border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground disabled:opacity-60 whitespace-pre-line text-left leading-tight"
      title={error ?? t('gearscoreBadgeTitle')}
    >
      {loading ? t('gearscoreRefreshLoading') : text}
    </button>
  );
}
