'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

type Char = { id: string; name: string };

export function RaidSignupForm({
  guildId,
  raidId,
  characters,
  initialCharacterId,
  initialType,
  initialAllowReserve,
}: {
  guildId: string;
  raidId: string;
  characters: Char[];
  initialCharacterId: string | null;
  initialType: string;
  initialAllowReserve: boolean;
}) {
  const t = useTranslations('raidDetail');
  const router = useRouter();
  const [characterId, setCharacterId] = useState(
    initialCharacterId ?? characters[0]?.id ?? ''
  );
  const [type, setType] = useState<'main' | 'reserve'>(
    initialType === 'reserve' ? 'reserve' : 'main'
  );
  const [allowReserve, setAllowReserve] = useState(initialAllowReserve);
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!characterId) {
      setMessage(t('signupPickCharacter'));
      setStatus('err');
      return;
    }
    setStatus('saving');
    setMessage(null);
    try {
      const res = await fetch(
        `/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}/signups`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            characterId,
            type,
            allowReserve: type === 'main' ? allowReserve : false,
          }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setMessage(data.error ?? t('signupError'));
        setStatus('err');
        return;
      }
      setMessage(t('signupSaved'));
      setStatus('ok');
      router.refresh();
    } catch {
      setMessage(t('signupError'));
      setStatus('err');
    }
  }

  if (characters.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('signupNoCharacters')}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-md">
      <div>
        <label htmlFor="raid-signup-char" className="block text-sm font-medium mb-1">
          {t('signupCharacter')}
        </label>
        <select
          id="raid-signup-char"
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={characterId}
          onChange={(e) => setCharacterId(e.target.value)}
        >
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <span className="block text-sm font-medium mb-2">{t('signupType')}</span>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="signup-type"
              checked={type === 'main'}
              onChange={() => setType('main')}
            />
            {t('signupTypeMain')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="signup-type"
              checked={type === 'reserve'}
              onChange={() => setType('reserve')}
            />
            {t('signupTypeReserve')}
          </label>
        </div>
      </div>
      {type === 'main' && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allowReserve}
            onChange={(e) => setAllowReserve(e.target.checked)}
          />
          {t('signupAllowReserve')}
        </label>
      )}
      <button
        type="submit"
        disabled={status === 'saving'}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {status === 'saving' ? t('signupSaving') : t('signupSubmit')}
      </button>
      {message && (
        <p
          className={`text-sm ${status === 'err' ? 'text-destructive' : 'text-muted-foreground'}`}
        >
          {message}
        </p>
      )}
    </form>
  );
}
