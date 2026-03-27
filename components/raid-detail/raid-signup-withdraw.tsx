'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export function RaidSignupWithdraw({
  guildId,
  raidId,
}: {
  guildId: string;
  raidId: string;
}) {
  const t = useTranslations('raidDetail');
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onWithdraw() {
    setPending(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}/signups`,
        { method: 'DELETE' }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(data.error ?? t('withdrawError'));
        setPending(false);
        return;
      }
      router.refresh();
    } catch {
      setErr(t('withdrawError'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="pt-2 border-t border-border">
      <button
        type="button"
        onClick={onWithdraw}
        disabled={pending}
        className="text-sm text-destructive hover:underline disabled:opacity-50"
      >
        {pending ? t('withdrawing') : t('withdraw')}
      </button>
      {err && <p className="text-sm text-destructive mt-1">{err}</p>}
    </div>
  );
}
