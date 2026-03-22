'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

type Entry = {
  id: string;
  entityId: string;
  action: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  changedByDiscordId: string | null;
};

export function RaidSignupHistoryPanel({
  guildId,
  raidId,
}: {
  guildId: string;
  raidId: string;
}) {
  const t = useTranslations('raidDetail');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || entries !== null) return;
    setLoading(true);
    setErr(null);
    fetch(
      `/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}/signup-audit`
    )
      .then(async (res) => {
        if (!res.ok) {
          setErr(t('historyLoadError'));
          return;
        }
        const data = (await res.json()) as { entries: Entry[] };
        setEntries(data.entries);
      })
      .catch(() => setErr(t('historyLoadError')))
      .finally(() => setLoading(false));
  }, [open, entries, guildId, raidId, t]);

  return (
    <div className="mt-6 border border-border rounded-lg p-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-medium text-foreground hover:underline w-full text-left"
      >
        {open ? '▼ ' : '▶ '}
        {t('historyTitle')}
      </button>
      {open && (
        <div className="mt-3 text-xs">
          {loading && <p className="text-muted-foreground">{t('historyLoading')}</p>}
          {err && <p className="text-destructive">{err}</p>}
          {entries && entries.length === 0 && (
            <p className="text-muted-foreground">{t('historyEmpty')}</p>
          )}
          {entries && entries.length > 0 && (
            <ul className="space-y-2 max-h-72 overflow-y-auto font-mono">
              {entries.map((e) => (
                <li key={e.id} className="border-b border-border pb-2">
                  <div className="text-muted-foreground">
                    {new Date(e.createdAt).toLocaleString('de-DE')} · {e.action} ·{' '}
                    {e.entityId.slice(0, 8)}…
                  </div>
                  {e.changedByDiscordId && (
                    <div className="text-muted-foreground">
                      {t('historyBy')}: {e.changedByDiscordId}
                    </div>
                  )}
                  {e.oldValue && (
                    <pre className="mt-1 whitespace-pre-wrap break-all text-amber-800 dark:text-amber-200/90">
                      − {e.oldValue.slice(0, 800)}
                      {e.oldValue.length > 800 ? '…' : ''}
                    </pre>
                  )}
                  {e.newValue && (
                    <pre className="mt-1 whitespace-pre-wrap break-all text-foreground/90">
                      + {e.newValue.slice(0, 800)}
                      {e.newValue.length > 800 ? '…' : ''}
                    </pre>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
