'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { RaidSignupPhase } from '@/lib/raid-detail-shared';
import { SpecIcon } from '@/components/spec-icon';
import { ClassIcon } from '@/components/class-icon';
import { getSpecByDisplayName } from '@/lib/wow-tbc-classes';
import { CharacterMainStar } from '@/components/character-main-star';
import { CharacterSpecIconsInline } from '@/components/character-display-parts';

type Char = {
  id: string;
  name: string;
  mainSpec: string;
  offSpec: string | null;
  classId: string | null;
  isMain: boolean;
};

type SignupType = 'normal' | 'uncertain' | 'reserve';
type PunctualityType = 'on_time' | 'tight' | 'late';

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
  initialPunctuality,
  initialNote,
  initialSignedSpec,
  initialOnlySignedSpec,
  initialForbidReserve,
  hasExistingSignup,
  onSaved,
}: {
  guildId: string;
  raidId: string;
  characters: Char[];
  signupPhase: RaidSignupPhase;
  initialCharacterId: string | null;
  initialType: string;
  initialIsLate: boolean;
  /** Wenn gesetzt, hat Vorrang vor initialIsLate (DB-Feld punctuality). */
  initialPunctuality?: 'on_time' | 'tight' | 'late';
  initialNote: string;
  initialSignedSpec: string | null;
  initialOnlySignedSpec: boolean;
  initialForbidReserve: boolean;
  hasExistingSignup: boolean;
  onSaved?: () => void;
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
  const [punctuality, setPunctuality] = useState<PunctualityType>(
    initialPunctuality ?? (initialIsLate ? 'late' : 'on_time')
  );
  const isLate = punctuality === 'late';
  const [note, setNote] = useState(initialNote);
  const [onlySignedSpec, setOnlySignedSpec] = useState(initialOnlySignedSpec);
  const [forbidReserve, setForbidReserve] = useState(initialForbidReserve);
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
    if (forbidReserve && effType === 'reserve') {
      setMessage(t('forbidReserveConflictsWithType'));
      setStatus('err');
      return;
    }
    const noteRequired = isLate || effType === 'uncertain' || effType === 'reserve';
    if (noteRequired) {
      const n = note.trim();
      if (n.length < 3) {
        setMessage(t('noteRequiredForState'));
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
            punctuality,
            isLate,
            note: note.trim() || null,
            signedSpec,
            onlySignedSpec,
            forbidReserve,
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
      onSaved?.();
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
    <form onSubmit={onSubmit} className="space-y-6 max-w-2xl">
      {reserveOnly && (
        <p className="text-sm text-amber-600 dark:text-amber-500">{t('signupReserveOnlyPhase')}</p>
      )}

      <section className="space-y-2">
        <span className="block text-sm font-semibold">{t('signupCharacter')}</span>
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
                className={`grid items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors min-w-0 ${
                  active
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-border bg-card hover:bg-muted/50'
                }`}
                style={{
                  gridTemplateColumns: '24px 26px 1fr auto',
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
                  <button
                    type="button"
                    title={t('signupWithMainSpec')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCharacterId(c.id);
                      setSignedSpec(c.mainSpec);
                    }}
                    className={`inline-flex rounded ${characterId === c.id && signedSpec === c.mainSpec ? 'ring-2 ring-primary/60' : ''}`}
                  >
                    <CharacterSpecIconsInline mainSpec={c.mainSpec} size={22} slashClassName="hidden" offSpec={null} />
                  </button>
                  {c.offSpec && (
                    <button
                      type="button"
                      title={t('signupWithOffSpec')}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCharacterId(c.id);
                        setSignedSpec(c.offSpec!);
                      }}
                      className={`inline-flex rounded ${characterId === c.id && signedSpec === c.offSpec ? 'ring-2 ring-primary/60' : 'opacity-75'}`}
                    >
                      <CharacterSpecIconsInline mainSpec={c.offSpec} size={22} slashClassName="hidden" offSpec={null} />
                    </button>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>
      {selectedChar && cid && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <ClassIcon classId={cid} size={20} />
          <span>{signedSpec}</span>
        </div>
      )}

      <section className="space-y-3">
        <span className="block text-sm font-semibold">{t('signupType')}</span>
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: 'normal' as const, icon: '✅', label: t('signupType_verfugbar') },
            { key: 'uncertain' as const, icon: '❔', label: t('signupType_uncertain') },
            { key: 'reserve' as const, icon: '🪑', label: t('signupType_reserve') },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              disabled={reserveOnly && opt.key !== 'reserve'}
              onClick={() => setType(opt.key)}
              className={`rounded-md border px-2 py-2 text-xs sm:text-sm ${
                type === opt.key ? 'border-primary bg-primary/10' : 'border-border bg-card'
              } ${reserveOnly && opt.key !== 'reserve' ? 'opacity-40 cursor-not-allowed' : ''}`}
              title={opt.label}
            >
              <span className="mr-1.5">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <span className="block text-sm font-semibold">{t('signupPunctuality')}</span>
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: 'on_time' as const, icon: '🟢', label: t('punctualityOnTime') },
            { key: 'tight' as const, icon: '🟡', label: t('punctualityTight') },
            { key: 'late' as const, icon: '🕒', label: t('punctualityLate') },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setPunctuality(opt.key)}
              className={`rounded-md border px-2 py-2 text-xs sm:text-sm ${
                punctuality === opt.key
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card'
              }`}
              title={opt.label}
            >
              <span className="mr-1.5">{opt.icon}</span>
              {opt.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <span className="block text-sm font-semibold">{t('signupConditions')}</span>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setOnlySignedSpec((v) => !v)}
            className={`rounded-md border px-3 py-2 text-left text-sm ${
              onlySignedSpec ? 'border-primary bg-primary/10' : 'border-border bg-card'
            }`}
          >
            <span className="mr-2">{onlySignedSpec ? '☑️' : '⬜'}</span>
            {t('conditionOnlySignedSpec')}
          </button>
          <button
            type="button"
            onClick={() => setForbidReserve((v) => !v)}
            className={`rounded-md border px-3 py-2 text-left text-sm ${
              forbidReserve ? 'border-primary bg-primary/10' : 'border-border bg-card'
            }`}
          >
            <span className="mr-2">{forbidReserve ? '☑️' : '⬜'}</span>
            {t('conditionForbidReserve')}
          </button>
        </div>
      </section>

      <div>
        <label htmlFor="raid-signup-note" className="block text-sm font-medium mb-1">
          {isLate || type === 'uncertain' || type === 'reserve' ? (
            <>
              {t('noteRequiredLabel')} <span className="text-destructive">*</span>
            </>
          ) : (
            t('commentOptional')
          )}
        </label>
        <textarea
          id="raid-signup-note"
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          placeholder={
            isLate || type === 'uncertain' || type === 'reserve'
              ? t('noteRequiredPlaceholder')
              : undefined
          }
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <input type="hidden" name="onlySignedSpec" value={onlySignedSpec ? '1' : '0'} />
      <input type="hidden" name="forbidReserve" value={forbidReserve ? '1' : '0'} />
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
