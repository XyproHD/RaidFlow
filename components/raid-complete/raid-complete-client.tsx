'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { formatRaidTerminLine } from '@/lib/format-raid-termin';
import { ClassIcon } from '@/components/class-icon';
import { CharacterMainStar } from '@/components/character-main-star';
import { CharacterSpecIconsInline } from '@/components/character-display-parts';
import type { GuildCharacterOption } from '@/components/raid-planner/raid-roster-planner';
import { normalizeParticipationWeight } from '@/lib/raid-participation-weight';

export type RaidCompleteSignupRow = {
  id: string;
  userId: string;
  characterId: string | null;
  name: string;
  mainSpec: string;
  classId: string | null;
  signedSpec: string | null;
  isMain: boolean;
  guildDiscordDisplayName: string | null;
};

type RaidHeader = {
  name: string;
  scheduledAt: string;
  scheduledEndAt: string | null;
  guildName: string;
  dungeonLabel: string;
  maxPlayers: number;
};

function cloneGroups(groups: string[][]): string[][] {
  return groups.map((g) => [...g]);
}

function buildInitialWeights(groups: string[][]): Record<string, number> {
  const w: Record<string, number> = {};
  for (const g of groups) {
    for (const id of g) {
      w[id] = 1;
    }
  }
  return w;
}

export function RaidCompleteClient({
  guildId,
  raidId,
  raid,
  organizerLabel,
  initialGroups,
  initialSignups,
  guildCharacters,
}: {
  guildId: string;
  raidId: string;
  raid: RaidHeader;
  organizerLabel: string | null;
  initialGroups: string[][];
  initialSignups: RaidCompleteSignupRow[];
  guildCharacters: GuildCharacterOption[];
}) {
  const t = useTranslations('raidComplete');
  const tRoster = useTranslations('raidRosterPlanner');
  const tDetail = useTranslations('raidDetail');
  const tProfile = useTranslations('profile');
  const locale = useLocale();
  const router = useRouter();

  const [groups, setGroups] = useState<string[][]>(() => cloneGroups(initialGroups));
  const [weights, setWeights] = useState<Record<string, number>>(() => buildInitialWeights(initialGroups));
  const [signupRows, setSignupRows] = useState<Record<string, RaidCompleteSignupRow>>(() => {
    const m: Record<string, RaidCompleteSignupRow> = {};
    for (const s of initialSignups) m[s.id] = s;
    return m;
  });

  const [addOpen, setAddOpen] = useState(false);
  const [addGroupIndex, setAddGroupIndex] = useState(0);
  const [addQuery, setAddQuery] = useState('');
  const [pickChar, setPickChar] = useState<GuildCharacterOption | null>(null);
  const [pickSpec, setPickSpec] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const raidTermin = useMemo(() => {
    const start = new Date(raid.scheduledAt);
    const end = raid.scheduledEndAt ? new Date(raid.scheduledEndAt) : null;
    return formatRaidTerminLine(locale, start, end);
  }, [raid.scheduledAt, raid.scheduledEndAt, locale]);

  const filteredGuildChars = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    if (!q) return guildCharacters;
    return guildCharacters.filter((c) => c.name.toLowerCase().includes(q));
  }, [addQuery, guildCharacters]);

  function setWeightFor(id: string, raw: string) {
    const w = normalizeParticipationWeight(raw);
    if (w === null) return;
    setWeights((prev) => ({ ...prev, [id]: w }));
  }

  function removeFromGroup(groupIndex: number, signupId: string) {
    setGroups((prev) =>
      prev.map((g, i) => (i === groupIndex ? g.filter((id) => id !== signupId) : g))
    );
  }

  function openAdd(groupIndex: number) {
    setAddGroupIndex(groupIndex);
    setAddQuery('');
    setPickChar(null);
    setPickSpec(null);
    setAddOpen(true);
    setFormError(null);
  }

  async function confirmAddFromGuild() {
    if (!pickChar || !pickSpec) return;
    const flat = groups.flat();
    if (flat.some((id) => signupRows[id]?.characterId === pickChar.id)) {
      setFormError(t('alreadyInRoster'));
      return;
    }
    setAddBusy(true);
    setFormError(null);
    try {
      const res = await fetch(
        `/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}/signups/leader`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUserId: pickChar.userId,
            characterId: pickChar.id,
            type: 'normal',
            signedSpec: pickSpec,
            leaderPlacement: 'confirmed',
          }),
        }
      );
      const j = (await res.json().catch(() => ({}))) as {
        signup?: { id: string; userId: string; characterId: string | null; signedSpec: string | null };
      };
      if (!res.ok || !j.signup?.id) {
        throw new Error((j as { error?: string }).error || t('addError'));
      }
      const su = j.signup;
      const name = pickChar.name;
      const mainSpec = pickChar.mainSpec;
      const row: RaidCompleteSignupRow = {
        id: su.id,
        userId: su.userId,
        characterId: su.characterId,
        name,
        mainSpec,
        classId: pickChar.classId,
        signedSpec: su.signedSpec ?? pickSpec,
        isMain: pickChar.isMain,
        guildDiscordDisplayName: pickChar.guildDiscordDisplayName,
      };
      setSignupRows((prev) => ({ ...prev, [row.id]: row }));
      setWeights((prev) => ({ ...prev, [row.id]: 1 }));
      setGroups((prev) => prev.map((g, i) => (i === addGroupIndex ? [...g, row.id] : g)));
      setAddOpen(false);
      setPickChar(null);
      setPickSpec(null);
      router.refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('addError'));
    } finally {
      setAddBusy(false);
    }
  }

  async function submitComplete() {
    const seen = new Set<string>();
    for (const g of groups) {
      for (const id of g) {
        if (seen.has(id)) {
          setFormError(t('duplicateSignup'));
          return;
        }
        seen.add(id);
        if (!signupRows[id]) {
          setFormError(t('missingSignup'));
          return;
        }
      }
    }
    if (!window.confirm(t('confirmSubmit'))) return;

    const entries: { signupId: string; weight: number }[] = [];
    for (const id of seen) {
      const w = weights[id] ?? 1;
      entries.push({ signupId: id, weight: w });
    }

    setSubmitBusy(true);
    setFormError(null);
    try {
      const res = await fetch(
        `/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}/complete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entries }),
        }
      );
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((j as { error?: string }).error || t('submitError'));
      }
      router.push(`/${locale}/dashboard?guild=${encodeURIComponent(guildId)}`);
      router.refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('submitError'));
    } finally {
      setSubmitBusy(false);
    }
  }

  const rosterEmpty = groups.every((g) => g.length === 0);

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/${locale}/guild/${guildId}/raid/${raidId}`}
          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
        >
          {t('backToRaid')}
        </Link>
      </div>

      <header className="rounded-xl border border-border bg-card/40 shadow-sm overflow-hidden">
        <div className="relative px-4 py-3 sm:px-5 sm:py-4">
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-2xl font-bold text-foreground tracking-tight">{raid.name}</h1>
            <p className="text-sm text-foreground/90">{raid.dungeonLabel}</p>
            <p className="text-sm text-foreground/90">
              <span className="text-muted-foreground">{tRoster('metaTermin')}</span> {raidTermin}
            </p>
            <p className="text-sm text-foreground/90">
              <span className="text-muted-foreground">{tRoster('metaOrganizer')}</span>{' '}
              {organizerLabel ?? tRoster('organizerUnset')}
            </p>
          </div>
        </div>
      </header>

      <div className="rounded-xl border border-border bg-card/40 shadow-sm overflow-hidden">
        <div className="border-b border-border bg-muted/20 px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">{t('title')}</h2>
          <p className="text-xs text-muted-foreground mt-1">{t('weightHint')}</p>
        </div>
        <div className="p-4 space-y-6">
          {rosterEmpty ? (
            <p className="text-sm text-muted-foreground">{t('emptyRosterHint')}</p>
          ) : null}
          {groups.map((g, gi) => (
            <div key={`grp-${gi}`} className="rounded-lg border border-border bg-background/50 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/15 px-3 py-2">
                <h3 className="text-sm font-semibold text-foreground">{t('groupTitle', { n: gi + 1 })}</h3>
                <button
                  type="button"
                  className="text-xs rounded-md border border-border px-2 py-1 hover:bg-muted"
                  onClick={() => openAdd(gi)}
                >
                  ➕ {t('addPlayer')}
                </button>
              </div>
              <ul className="divide-y divide-border">
                {g.length === 0 ? (
                  <li className="px-3 py-4 text-sm text-muted-foreground text-center">{tRoster('rosterEmpty')}</li>
                ) : (
                  g.map((signupId) => {
                    const s = signupRows[signupId];
                    if (!s) {
                      return (
                        <li key={signupId} className="px-3 py-2 text-sm text-destructive">
                          {signupId}
                        </li>
                      );
                    }
                    const specShow = (s.signedSpec?.trim() || s.mainSpec || '—').trim();
                    return (
                      <li
                        key={signupId}
                        className="flex flex-wrap items-center gap-3 px-3 py-2.5 text-sm"
                      >
                        <CharacterMainStar
                          isMain={!!s.isMain}
                          titleMain={tProfile('mainLabel')}
                          titleAlt={tProfile('altLabel')}
                          sizePx={16}
                        />
                        {s.classId ? <ClassIcon classId={s.classId} size={22} /> : null}
                        <CharacterSpecIconsInline mainSpec={specShow} size={20} slashClassName="hidden" offSpec={null} />
                        <span className="font-medium truncate min-w-0 flex-1">{s.name}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[10rem]">
                          {s.guildDiscordDisplayName ?? ''}
                        </span>
                        <label className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{t('weightLabel')}</span>
                          <input
                            type="number"
                            min={0}
                            max={1}
                            step={0.1}
                            className="w-20 rounded-md border border-input bg-background px-2 py-1 text-sm tabular-nums"
                            value={weights[signupId] ?? 1}
                            onChange={(e) => setWeightFor(signupId, e.target.value)}
                          />
                        </label>
                        <button
                          type="button"
                          className="text-xs text-destructive hover:underline shrink-0"
                          onClick={() => removeFromGroup(gi, signupId)}
                        >
                          {t('removeFromGroup')}
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          ))}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={submitBusy}
              className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
              onClick={() => void submitComplete()}
            >
              {submitBusy ? t('submitting') : t('submit')}
            </button>
          </div>
          {formError ? <p className="text-destructive text-sm">{formError}</p> : null}
        </div>
      </div>

      {addOpen ? (
        <div
          className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setAddOpen(false);
          }}
        >
          <div
            className="my-6 w-full max-w-lg rounded-xl border border-border bg-background shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h2 className="text-base font-semibold">{t('addPlayer')}</h2>
              <button
                type="button"
                className="rounded-md border border-border px-2 py-1 text-sm hover:bg-muted"
                onClick={() => setAddOpen(false)}
              >
                {tDetail('withdrawReasonCancel')}
              </button>
            </div>
            <div className="p-4 space-y-3">
              {!pickChar ? (
                <>
                  <input
                    type="search"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder={t('searchPlaceholder')}
                    value={addQuery}
                    onChange={(e) => setAddQuery(e.target.value)}
                  />
                  <div className="max-h-[min(50vh,360px)] overflow-y-auto rounded-md border border-border divide-y divide-border">
                    {filteredGuildChars.length === 0 ? (
                      <p className="p-3 text-sm text-muted-foreground">{t('noGuildChars')}</p>
                    ) : (
                      filteredGuildChars.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2"
                          onClick={() => {
                            setPickChar(c);
                            if (c.offSpec?.trim()) {
                              setPickSpec(null);
                            } else {
                              setPickSpec(c.mainSpec.trim());
                            }
                          }}
                        >
                          {c.classId ? <ClassIcon classId={c.classId} size={20} /> : null}
                          <span className="font-medium">{c.name}</span>
                          <span className="text-xs text-muted-foreground truncate">{c.mainSpec}</span>
                        </button>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm">
                    <span className="font-medium">{pickChar.name}</span>
                  </p>
                  {pickChar.offSpec?.trim() ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">{t('pickSpec')}</p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={cn(
                            'rounded-md border px-3 py-1.5 text-sm',
                            pickSpec === pickChar.mainSpec.trim()
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:bg-muted'
                          )}
                          onClick={() => setPickSpec(pickChar.mainSpec.trim())}
                        >
                          {pickChar.mainSpec}
                        </button>
                        <button
                          type="button"
                          className={cn(
                            'rounded-md border px-3 py-1.5 text-sm',
                            pickSpec === pickChar.offSpec!.trim()
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:bg-muted'
                          )}
                          onClick={() => setPickSpec(pickChar.offSpec!.trim())}
                        >
                          {pickChar.offSpec}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
                      onClick={() => {
                        setPickChar(null);
                        setPickSpec(null);
                      }}
                    >
                      {tDetail('withdrawReasonCancel')}
                    </button>
                    <button
                      type="button"
                      disabled={addBusy || !pickSpec}
                      className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm disabled:opacity-50"
                      onClick={() => void confirmAddFromGuild()}
                    >
                      {addBusy ? '…' : tDetail('signupSubmit')}
                    </button>
                  </div>
                </div>
              )}
              {formError ? <p className="text-destructive text-sm">{formError}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
