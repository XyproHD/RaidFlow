'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { RaidSignupPhase } from '@/lib/raid-detail-access';
import { SpecIcon } from '@/components/spec-icon';
import { ClassIcon } from '@/components/class-icon';
import { getSpecByDisplayName } from '@/lib/wow-tbc-classes';
import { CharacterMainStar } from '@/components/character-main-star';

type Char = {
  id: string;
  name: string;
  mainSpec: string;
  offSpec: string | null;
  classId: string | null;
  isMain: boolean;
};

type SignupType = 'normal' | 'uncertain' | 'reserve';

function normalizeInitialType(raw: string | undefined): SignupType {
  if (raw === 'reserve') return 'reserve';
  if (raw === 'uncertain') return 'uncertain';
  if (raw === 'main' || raw === 'normal') return 'normal';
  return 'normal';
}

function classIdFromMain(mainSpec: string): string | null {
  return getSpecByDisplayName(mainSpec)?.classId ?? null;
}

export function RaidSignupForm({
  guildId,
  raidId,
  characters,
  signupPhase,
  initialCharacterId,
  initialType,
  initialIsLate,
  initialNote,
  initialSignedSpec,
  hasExistingSignup,
}: {
  guildId: string;
  raidId: string;
  characters: Char[];
  signupPhase: RaidSignupPhase;
  initialCharacterId: string | null;
  initialType: string;
  initialIsLate: boolean;
  initialNote: string;
  initialSignedSpec: string | null;
  hasExistingSignup: boolean;
}) {
  const t = useTranslations('raidDetail');
  const tProfile = useTranslations('profile');
  const router = useRouter();
  const reserveOnly = signupPhase === 'reserve_only';

  const [characterId, setCharacterId] = useState(
    initialCharacterId ?? characters[0]?.id ?? ''
  );

  const selectedChar = characters.find((c) => c.id === characterId) ?? null;

  const defaultSpecFor = (c: Char | null): string => {
    if (!c) return '';
    return initialSignedSpec && c.id === initialCharacterId
      ? initialSignedSpec
      : c.mainSpec;
  };

  const [signedSpec, setSignedSpec] = useState(() =>
    selectedChar ? defaultSpecFor(selectedChar) : ''
  );

  useEffect(() => {
    if (!selectedChar) return;
    setSignedSpec((prev) => {
      if (
        prev &&
        (prev === selectedChar.mainSpec ||
          (selectedChar.offSpec && prev === selectedChar.offSpec))
      ) {
        return prev;
      }
      return selectedChar.mainSpec;
    });
  }, [selectedChar]);

  const [type, setType] = useState<SignupType>(() =>
    reserveOnly ? 'reserve' : normalizeInitialType(initialType)
  );
  const [isLate, setIsLate] = useState(initialIsLate);
  const [note, setNote] = useState(initialNote);
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!characterId || !selectedChar) {
      setMessage(t('signupPickCharacter'));
      setStatus('err');
      return;
    }
    const specOk =
      signedSpec === selectedChar.mainSpec ||
      (selectedChar.offSpec && signedSpec === selectedChar.offSpec);
    if (!specOk || !signedSpec) {
      setMessage(t('signupPickSpec'));
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
            isLate,
            note: note.trim() || null,
            signedSpec,
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

  const cid = selectedChar ? selectedChar.classId ?? classIdFromMain(selectedChar.mainSpec) : null;

  return (
    <form onSubmit={onSubmit} className="space-y-4 max-w-2xl">
      {reserveOnly && (
        <p className="text-sm text-amber-600 dark:text-amber-500">{t('signupReserveOnlyPhase')}</p>
      )}

      <div>
        <span className="block text-sm font-medium mb-2">{t('signupCharacter')}</span>
        <div className="flex flex-col gap-2">
          {characters.map((c) => {
            const cClass = c.classId ?? classIdFromMain(c.mainSpec);
            const active = characterId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setCharacterId(c.id);
                  setSignedSpec(c.mainSpec);
                }}
                className={`grid items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors min-w-0 ${
                  active
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-border bg-card hover:bg-muted/50'
                }`}
                style={{
                  gridTemplateColumns: '24px 28px 1fr minmax(0,auto)',
                }}
              >
                <span className="flex shrink-0 items-center justify-center w-6 h-7">
                  <CharacterMainStar
                    isMain={!!c.isMain}
                    titleMain={tProfile('mainLabel')}
                    titleAlt={tProfile('altLabel')}
                    sizePx={18}
                  />
                </span>
                <span className="flex shrink-0 items-center justify-center w-7 h-7">
                  {cClass ? <ClassIcon classId={cClass} size={24} title={c.mainSpec} /> : null}
                </span>
                <span className="font-medium truncate">{c.name}</span>
                <span className="flex items-center gap-1 justify-end shrink-0">
                  <SpecIcon spec={c.mainSpec} size={22} />
                  {c.offSpec && (
                    <>
                      <span className="text-muted-foreground text-xs">/</span>
                      <span className="grayscale inline-flex opacity-90">
                        <SpecIcon spec={c.offSpec} size={22} />
                      </span>
                    </>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {selectedChar && (
        <div>
          <span className="block text-sm font-medium mb-2">{t('signupSpecChoice')}</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSignedSpec(selectedChar.mainSpec)}
              className={`inline-flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
                signedSpec === selectedChar.mainSpec
                  ? 'border-primary bg-primary/10'
                  : 'border-border'
              }`}
            >
              <SpecIcon spec={selectedChar.mainSpec} size={24} />
              {t('signupWithMainSpec')}
            </button>
            {selectedChar.offSpec && (
              <button
                type="button"
                onClick={() => setSignedSpec(selectedChar.offSpec!)}
                className={`inline-flex items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
                signedSpec === selectedChar.offSpec
                  ? 'border-primary bg-primary/10'
                  : 'border-border'
              }`}
              >
                <SpecIcon spec={selectedChar.offSpec} size={24} />
                {t('signupWithOffSpec')}
              </button>
            )}
          </div>
          {cid && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <ClassIcon classId={cid} size={20} />
              <span>{signedSpec}</span>
            </div>
          )}
        </div>
      )}

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
              {t('signupType_verfugbar')}
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
        {status === 'saving'
          ? t('signupSaving')
          : hasExistingSignup
            ? t('signupApplyChange')
            : t('signupSubmit')}
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
