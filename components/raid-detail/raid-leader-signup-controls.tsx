'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

export function RaidLeaderSignupControls({
  guildId,
  raidId,
  signupId,
  leaderAllowsReserve,
  leaderMarkedTeilnehmer,
  onSaved,
}: {
  guildId: string;
  raidId: string;
  signupId: string;
  leaderAllowsReserve: boolean;
  leaderMarkedTeilnehmer: boolean;
  onSaved: () => void;
}) {
  const t = useTranslations('raidDetail');
  const [allowRes, setAllowRes] = useState(leaderAllowsReserve);
  const [teil, setTeil] = useState(leaderMarkedTeilnehmer);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setAllowRes(leaderAllowsReserve);
    setTeil(leaderMarkedTeilnehmer);
  }, [leaderAllowsReserve, leaderMarkedTeilnehmer]);

  async function patch(partial: {
    leaderAllowsReserve?: boolean;
    leaderMarkedTeilnehmer?: boolean;
  }) {
    setPending(true);
    try {
      const res = await fetch(
        `/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}/signups/${encodeURIComponent(signupId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(partial),
        }
      );
      if (!res.ok) return;
      onSaved();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-4 text-sm items-center">
      <label className="inline-flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={teil}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.checked;
            setTeil(v);
            void patch({ leaderMarkedTeilnehmer: v });
          }}
        />
        {t('leaderTeilnehmer')}
      </label>
      <label className="inline-flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={allowRes}
          disabled={pending}
          onChange={(e) => {
            const v = e.target.checked;
            setAllowRes(v);
            void patch({ leaderAllowsReserve: v });
          }}
        />
        {t('leaderReserveZulassen')}
      </label>
    </div>
  );
}
