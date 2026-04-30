'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { RaidSignupPhase, RaidSignupSelfSnapshot } from '@/lib/raid-detail-shared';
import { normalizeSignupPunctuality as normalizePunctualityFromDb } from '@/lib/raid-signup-constants';
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

type SignupType = 'normal' | 'uncertain' | 'reserve' | 'declined';
type PunctualityType = 'on_time' | 'tight' | 'late';

function normalizeInitialType(raw: string | undefined): SignupType {
  if (raw === 'reserve') return 'reserve';
  if (raw === 'uncertain') return 'uncertain';
  if (raw === 'declined') return 'declined';
  if (raw === 'main' || raw === 'normal') return 'normal';
  return 'normal';
}

function initialSignupType(
  mySignups: RaidSignupSelfSnapshot[],
  reserveOnly: boolean
): SignupType {
  const raw = mySignups[0]?.type;
  if (reserveOnly) {
    if (raw === 'declined') return 'declined';
    return 'reserve';
  }
  return normalizeInitialType(raw);
}

function classIdFromMain(mainSpec: string): string | null {
  return getSpecByDisplayName(mainSpec)?.classId ?? null;
}

function buildSpecMap(
  characters: Char[],
  mySignups: RaidSignupSelfSnapshot[]
): Record<string, string> {
  const m: Record<string, string> = {};
  for (const c of characters) m[c.id] = c.mainSpec;
  for (const s of mySignups) {
    if (s.characterId && s.signedSpec) m[s.characterId] = s.signedSpec;
  }
  return m;
}

export function RaidSignupForm({
  guildId,
  raidId,
  characters,
  signupPhase,
  mySignups,
  onSaved,
}: {
  guildId: string;
  raidId: string;
  characters: Char[];
  signupPhase: RaidSignupPhase;
  mySignups: RaidSignupSelfSnapshot[];
  onSaved?: () => void;
}) {
  const t = useTranslations('raidDetail');
  const tProfile = useTranslations('profile');
  const router = useRouter();
  const reserveOnly = signupPhase === 'reserve_only';

  const initialIds = useMemo(
    () =>
      new Set(
        mySignups.map((s) => s.characterId).filter((id): id is string => typeof id === 'string' && id.length > 0)
      ),
    [mySignups]
  );

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (initialIds.size > 0) return new Set(initialIds);
    if (characters[0]) return new Set([characters[0].id]);
    return new Set();
  });

  const [specByChar, setSpecByChar] = useState<Record<string, string>>(() =>
    buildSpecMap(characters, mySignups)
  );

  useEffect(() => {
    setSpecByChar((prev) => {
      const next = { ...prev };
      for (const c of characters) {
        if (next[c.id] === undefined) next[c.id] = c.mainSpec;
      }
      return next;
    });
  }, [characters]);

  const firstSignup = mySignups[0];

  const [type, setType] = useState<SignupType>(() => initialSignupType(mySignups, reserveOnly));
  const [punctuality, setPunctuality] = useState<PunctualityType>(
    firstSignup ? normalizePunctualityFromDb(firstSignup.punctuality, firstSignup.isLate) : 'on_time'
  );
  const isLate = punctuality === 'late';
  const [note, setNote] = useState(firstSignup?.note ?? '');
  const [onlySignedSpec, setOnlySignedSpec] = useState(firstSignup?.onlySignedSpec ?? false);
  const [forbidReserve, setForbidReserve] = useState(firstSignup?.forbidReserve ?? false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'ok' | 'err'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  const isDeclined = type === 'declined';
  const effType: SignupType = reserveOnly && !isDeclined ? 'reserve' : type;

  const toggleChar = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setSpecFor = useCallback((charId: string, spec: string) => {
    setSelectedIds((prev) => new Set(prev).add(charId));
    setSpecByChar((m) => ({ ...m, [charId]: spec }));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setMessage(t('signupPickCharacters'));
      setStatus('err');
      return;
    }

    if (!isDeclined) {
      for (const id of ids) {
        const c = characters.find((x) => x.id === id);
        if (!c) continue;
        const sp = specByChar[id] ?? c.mainSpec;
        const specOk =
          sp === c.mainSpec || (c.offSpec && sp === c.offSpec);
        if (!specOk || !sp) {
          setMessage(t('signupPickSpec'));
          setStatus('err');
          return;
        }
      }
    }

    if (!isDeclined && forbidReserve && effType === 'reserve') {
      setMessage(t('forbidReserveConflictsWithType'));
      setStatus('err');
      return;
    }

    const noteRequired =
      !isDeclined && (isLate || effType === 'uncertain' || effType === 'reserve');
    if (noteRequired) {
      const n = note.trim();
      if (n.length < 3) {
        setMessage(t('noteRequiredForState'));
        setStatus('err');
        return;
      }
    }

    const initialCharIds = new Set(
      mySignups.map((s) => s.characterId).filter((id): id is string => !!id)
    );
    const toRemove = Array.from(initialCharIds).filter((id) => !selectedIds.has(id));

    setStatus('saving');
    setMessage(null);
    try {
      for (const characterId of toRemove) {
        const res = await fetch(
          `/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}/signups`,
          {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ characterId }),
          }
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setMessage(data.error ?? t('signupError'));
          setStatus('err');
          return;
        }
      }

      for (const characterId of ids) {
        const c = characters.find((x) => x.id === characterId);
        if (!c) continue;
        const signedSpec = isDeclined ? c.mainSpec : specByChar[characterId] ?? c.mainSpec;
        const res = await fetch(
          `/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}/signups`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              characterId,
              type: effType,
              punctuality: isDeclined ? 'on_time' : punctuality,
              isLate: isDeclined ? false : isLate,
              note: note.trim() || null,
              signedSpec,
              onlySignedSpec: isDeclined ? false : onlySignedSpec,
              forbidReserve: isDeclined ? false : forbidReserve,
            }),
          }
        );
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setMessage(data.error ?? t('signupError'));
          setStatus('err');
          return;
        }
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

  const hasExistingSignup = mySignups.length > 0;

  return (
    <form onSubmit={onSubmit} className="space-y-6 max-w-2xl">
      {reserveOnly && (
        <p className="text-sm text-amber-600 dark:text-amber-500">{t('signupReserveOnlyPhase')}</p>
      )}

      <section className="space-y-2">
        <p className="text-sm text-muted-foreground">{t('signupCharacterSpecHint')}</p>
        <span className="block text-sm font-semibold">{t('signupCharacter')}</span>
        <div className="flex flex-col gap-2">
          {characters.map((c) => {
            const cClass = c.classId ?? classIdFromMain(c.mainSpec);
            const selected = selectedIds.has(c.id);
            const sp = specByChar[c.id] ?? c.mainSpec;
            return (
              <div
                key={c.id}
                className={`grid items-center gap-2 rounded-lg border px-2.5 py-2 text-left transition-colors min-w-0 ${
                  selected
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-border bg-card'
                }`}
                style={{
                  gridTemplateColumns: '22px 24px 26px 1fr auto',
                }}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleChar(c.id)}
                  className="h-4 w-4 shrink-0 rounded border-border accent-primary"
                  aria-label={c.name}
                />
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
                <button
                  type="button"
                  onClick={() => toggleChar(c.id)}
                  className="font-medium truncate text-left hover:underline-offset-2 min-w-0"
                >
                  {c.name}
                </button>
                <span className="flex items-center gap-1 justify-end shrink-0">
                  <button
                    type="button"
                    title={t('signupWithMainSpec')}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSpecFor(c.id, c.mainSpec);
                    }}
                    className={`inline-flex rounded-md border-2 p-0.5 transition-colors ${
                      selected && sp === c.mainSpec
                        ? 'border-green-600 dark:border-green-500 ring-2 ring-green-600/40 dark:ring-green-500/40'
                        : 'border-transparent opacity-90'
                    }`}
                  >
                    <CharacterSpecIconsInline mainSpec={c.mainSpec} size={22} slashClassName="hidden" offSpec={null} />
                  </button>
                  {c.offSpec && (
                    <button
                      type="button"
                      title={t('signupWithOffSpec')}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSpecFor(c.id, c.offSpec!);
                      }}
                      className={`inline-flex rounded-md border-2 p-0.5 transition-colors ${
                        selected && sp === c.offSpec
                          ? 'border-green-600 dark:border-green-500 ring-2 ring-green-600/40 dark:ring-green-500/40'
                          : 'border-transparent opacity-75'
                      }`}
                    >
                      <CharacterSpecIconsInline mainSpec={c.offSpec} size={22} slashClassName="hidden" offSpec={null} />
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <span className="block text-sm font-semibold">{t('signupType')}</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              { key: 'normal' as const, icon: '✅', label: t('signupType_verfugbar') },
              { key: 'reserve' as const, icon: '🪑', label: t('signupType_reserve') },
              { key: 'uncertain' as const, icon: '❔', label: t('signupType_uncertain') },
              { key: 'declined' as const, icon: '🚫', label: t('signupType_declined') },
            ] as const
          ).map((opt) => {
            const disabled = reserveOnly && opt.key !== 'reserve' && opt.key !== 'declined';
            return (
              <button
                key={opt.key}
                type="button"
                disabled={disabled}
                onClick={() => setType(opt.key)}
                className={`rounded-md border px-2 py-2 text-xs sm:text-sm ${
                  type === opt.key ? 'border-primary bg-primary/10' : 'border-border bg-card'
                } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                title={opt.label}
              >
                <span className="mr-1.5">{opt.icon}</span>
                {opt.label}
              </button>
            );
          })}
        </div>
      </section>

      {!isDeclined && (
        <>
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
        </>
      )}

      <div>
        <label htmlFor="raid-signup-note" className="block text-sm font-medium mb-1">
          {isDeclined ? (
            t('commentOptional')
          ) : noteRequiredVisual(isLate, effType) ? (
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
            !isDeclined && noteRequiredVisual(isLate, effType)
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

function noteRequiredVisual(isLate: boolean, effType: SignupType): boolean {
  return isLate || effType === 'uncertain' || effType === 'reserve';
}
