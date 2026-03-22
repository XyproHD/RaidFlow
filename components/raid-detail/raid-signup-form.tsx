'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { RaidSignupPhase } from '@/lib/raid-detail-access';

type Char = { id: string; name: string };

type SignupType = 'normal' | 'uncertain' | 'reserve';

function normalizeInitialType(raw: string | undefined): SignupType {
  if (raw === 'reserve') return 'reserve';
  if (raw === 'uncertain') return 'uncertain';
  if (raw === 'main' || raw === 'normal') return 'normal';
  return 'normal';
}

export function RaidSignupForm({
  guildId,
  raidId,
  characters,
  signupPhase,
  initialCharacterId,
  initialType,
  initialAllowReserve,
  initialIsLate,
  initialNote,
}: {
  guildId: string;
  raidId: string;
  characters: Char[];
  signupPhase: RaidSignupPhase;
  initialCharacterId: string | null;
  initialType: string;
  initialAllowReserve: boolean;
  initialIsLate: boolean;
  initialNote: string;
}) {
  const t = useTranslations('raidDetail');
  const router = useRouter();
  const reserveOnly = signupPhase === 'reserve_only';

  const [characterId, setCharacterId] = useState(
    initialCharacterId ?? characters[0]?.id ?? ''
  );
  const [type, setType] = useState<SignupType>(() =>
    reserveOnly ? 'reserve' : normalizeInitialType(initialType)
  );
  const [allowReserve, setAllowReserve] = useState(initialAllowReserve);
  const [isLate, setIsLate] = useState(initialIsLate);
  const [note, setNote] = useState(initialNote);
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!characterId) {
      setMessage(t('signupPickCharacter'));
      setStatus('err');
      return;
    }
    const effType = reserveOnly ? 'reserve' : type;
    if (isLate) {
      const n = note.trim();
      if (n.length < 3) {
        setMessage(t('lateNoteRequired'));
        setStatus('err');
        return;
      }
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
            type: effType,
            allowReserve: effType === 'normal' ? allowReserve : false,
            isLate,
            note: note.trim() || null,
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
    <form onSubmit={onSubmit} className="space-y-4 max-w-lg">
      {reserveOnly && (
        <p className="text-sm text-amber-600 dark:text-amber-500">{t('signupReserveOnlyPhase')}</p>
      )}

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

      {!reserveOnly && (
        <div>
          <span className="block text-sm font-medium mb-2">{t('signupType')}</span>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="signup-type"
                checked={type === 'normal'}
                onChange={() => setType('normal')}
              />
              {t('signupType_normal')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="signup-type"
                checked={type === 'uncertain'}
                onChange={() => setType('uncertain')}
              />
              {t('signupType_uncertain')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="signup-type"
                checked={type === 'reserve'}
                onChange={() => setType('reserve')}
              />
              {t('signupType_reserve')}
            </label>
          </div>
        </div>
      )}

      {type === 'normal' && !reserveOnly && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={allowReserve}
            onChange={(e) => setAllowReserve(e.target.checked)}
          />
          {t('signupAllowReserve')}
        </label>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isLate}
          onChange={(e) => {
            setIsLate(e.target.checked);
            if (!e.target.checked) setMessage(null);
          }}
        />
        {t('lateCheckbox')}
      </label>

      <div>
        <label htmlFor="raid-signup-note" className="block text-sm font-medium mb-1">
          {isLate ? (
            <>
              {t('lateNoteHint')}{' '}
              <span className="text-destructive">*</span>
            </>
          ) : (
            t('commentOptional')
          )}
        </label>
        <textarea
          id="raid-signup-note"
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder={isLate ? t('lateNotePlaceholder') : undefined}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

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
