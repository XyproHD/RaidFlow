'use client';

import { createPortal } from 'react-dom';
import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { formatRaidTerminLine } from '@/lib/format-raid-termin';
import { getSpecByDisplayName, type TbcRole } from '@/lib/wow-tbc-classes';
import { roleFromSpecDisplayName } from '@/lib/spec-to-role';
import { ClassIcon } from '@/components/class-icon';
import { RoleIcon } from '@/components/role-icon';
import { CharacterMainStar } from '@/components/character-main-star';
import {
  CharacterDiscordPill,
  CharacterForbidReserveBadge,
  CharacterGearscorePill,
  CharacterSignupPunctualityMark,
  CharacterSpecIconsInline,
} from '@/components/character-display-parts';
import type { GuildCharacterOption } from '@/components/raid-planner/raid-roster-planner';
import { normalizeParticipationWeight } from '@/lib/raid-participation-weight';

export type RaidCompleteSignupRow = {
  id: string;
  userId: string;
  characterId: string | null;
  name: string;
  mainSpec: string;
  offSpec: string | null;
  classId: string | null;
  signedSpec: string | null;
  originalSignedSpec: string | null;
  onlySignedSpec: boolean;
  isMain: boolean;
  guildDiscordDisplayName: string | null;
  role: TbcRole;
  signupType: string;
  punctuality: 'on_time' | 'tight' | 'late';
  isLate: boolean;
  forbidReserve: boolean;
  note: string | null;
  gearScore: number | null;
};

type RaidHeader = {
  name: string;
  scheduledAt: string;
  scheduledEndAt: string | null;
  guildName: string;
  dungeonLabel: string;
  maxPlayers: number;
};

function typeNorm(v: string) {
  return v === 'main' ? 'normal' : v;
}

function attendanceRowVariant(s: RaidCompleteSignupRow): 'default' | 'uncertain' | 'declined' {
  const tn = typeNorm(s.signupType);
  if (tn === 'uncertain') return 'uncertain';
  if (tn === 'declined') return 'declined';
  return 'default';
}

function punctualityOf(s: RaidCompleteSignupRow): 'on_time' | 'tight' | 'late' {
  const p = s.punctuality;
  if (p === 'tight' || p === 'late' || p === 'on_time') return p;
  return s.isLate ? 'late' : 'on_time';
}

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

function effectiveSignedSpec(s: RaidCompleteSignupRow): string {
  return (s.signedSpec?.trim() || s.originalSignedSpec?.trim() || s.mainSpec.trim()).trim();
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
  const tPlanner = useTranslations('raidPlanner');
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
  const [addSelectedId, setAddSelectedId] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [specPatchingId, setSpecPatchingId] = useState<string | null>(null);

  const raidTermin = useMemo(() => {
    const start = new Date(raid.scheduledAt);
    const end = raid.scheduledEndAt ? new Date(raid.scheduledEndAt) : null;
    return formatRaidTerminLine(locale, start, end);
  }, [raid.scheduledAt, raid.scheduledEndAt, locale]);

  const guildCharacterById = useMemo(
    () => new Map(guildCharacters.map((c) => [c.id, c])),
    [guildCharacters]
  );

  const resolveDiscordNameForRow = useCallback(
    (s: RaidCompleteSignupRow): string | null => {
      const direct = s.guildDiscordDisplayName?.trim();
      if (direct) return direct;
      const cid = (s.characterId ?? '').trim();
      if (cid) {
        const fromCharacter = guildCharacterById.get(cid)?.guildDiscordDisplayName?.trim();
        if (fromCharacter) return fromCharacter;
      }
      const uid = (s.userId ?? '').trim();
      if (!uid) return null;
      for (const c of guildCharacters) {
        if (c.userId.trim() !== uid || !c.isMain) continue;
        const d = c.guildDiscordDisplayName?.trim();
        if (d) return d;
      }
      for (const c of guildCharacters) {
        if (c.userId.trim() !== uid) continue;
        const d = c.guildDiscordDisplayName?.trim();
        if (d) return d;
      }
      for (const row of Object.values(signupRows)) {
        if (row.userId.trim() !== uid) continue;
        const d = row.guildDiscordDisplayName?.trim();
        if (d) return d;
      }
      return null;
    },
    [guildCharacterById, guildCharacters, signupRows]
  );

  const resolveGearScoreForRow = useCallback(
    (s: RaidCompleteSignupRow): number | null => {
      if (typeof s.gearScore === 'number') return s.gearScore;
      const cid = (s.characterId ?? '').trim();
      if (cid) {
        const g = guildCharacterById.get(cid)?.gearScore;
        if (typeof g === 'number') return g;
      }
      const uid = (s.userId ?? '').trim();
      if (!uid) return null;
      for (const c of guildCharacters) {
        if (c.userId.trim() !== uid) continue;
        if (typeof c.gearScore === 'number') return c.gearScore;
      }
      for (const row of Object.values(signupRows)) {
        if (row.userId.trim() !== uid) continue;
        if (typeof row.gearScore === 'number') return row.gearScore;
      }
      return null;
    },
    [guildCharacterById, guildCharacters, signupRows]
  );

  const resolveDiscordNameForCharacterOption = useCallback(
    (c: GuildCharacterOption): string | null => {
      const direct = c.guildDiscordDisplayName?.trim();
      if (direct) return direct;
      const uid = c.userId.trim();
      if (!uid) return null;
      for (const other of guildCharacters) {
        if (other.userId.trim() !== uid || !other.isMain) continue;
        const d = other.guildDiscordDisplayName?.trim();
        if (d) return d;
      }
      for (const other of guildCharacters) {
        if (other.userId.trim() !== uid) continue;
        const d = other.guildDiscordDisplayName?.trim();
        if (d) return d;
      }
      for (const row of Object.values(signupRows)) {
        if (row.userId.trim() !== uid) continue;
        const d = row.guildDiscordDisplayName?.trim();
        if (d) return d;
      }
      return null;
    },
    [guildCharacters, signupRows]
  );

  const resolveGearScoreForCharacterOption = useCallback(
    (c: GuildCharacterOption): number | null => {
      if (typeof c.gearScore === 'number') return c.gearScore;
      const uid = c.userId.trim();
      if (!uid) return null;
      for (const other of guildCharacters) {
        if (other.userId.trim() !== uid) continue;
        if (typeof other.gearScore === 'number') return other.gearScore;
      }
      for (const row of Object.values(signupRows)) {
        if (row.userId.trim() !== uid) continue;
        if (typeof row.gearScore === 'number') return row.gearScore;
      }
      return null;
    },
    [guildCharacters, signupRows]
  );

  const usedCharacterIds = useMemo(() => {
    const set = new Set<string>();
    for (const id of groups.flat()) {
      const cid = signupRows[id]?.characterId?.trim();
      if (cid) set.add(cid);
    }
    return set;
  }, [groups, signupRows]);

  const addCandidates = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    const all = guildCharacters.filter((c) => !usedCharacterIds.has(c.id));
    if (!q) return all.slice(0, 50);
    return all
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 50);
  }, [addQuery, guildCharacters, usedCharacterIds]);

  const addSelected = useMemo(
    () => (addSelectedId ? guildCharacters.find((c) => c.id === addSelectedId) ?? null : null),
    [addSelectedId, guildCharacters]
  );

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
    setAddSelectedId(null);
    setAddOpen(true);
    setFormError(null);
  }

  async function patchSignedSpec(signupId: string, spec: string) {
    setSpecPatchingId(signupId);
    setFormError(null);
    try {
      const res = await fetch(
        `/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}/signups/${encodeURIComponent(signupId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ signedSpec: spec.trim() }),
        }
      );
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(j.error || t('specUpdateError'));
      }
      const nextRole = (roleFromSpecDisplayName(spec) ?? 'Melee') as TbcRole;
      const classId = getSpecByDisplayName(spec)?.classId ?? signupRows[signupId]?.classId ?? null;
      setSignupRows((prev) => {
        const cur = prev[signupId];
        if (!cur) return prev;
        return {
          ...prev,
          [signupId]: {
            ...cur,
            signedSpec: spec.trim(),
            role: nextRole,
            classId,
          },
        };
      });
      router.refresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t('specUpdateError'));
    } finally {
      setSpecPatchingId(null);
    }
  }

  function renderSpecIcons(s: RaidCompleteSignupRow, interactive: boolean) {
    const main = s.mainSpec.trim();
    const off = (s.offSpec ?? '').trim();
    const signed = effectiveSignedSpec(s);
    const hasOff = !!off;
    const canSwitch = interactive && hasOff && !s.onlySignedSpec && specPatchingId !== s.id;
    const isOverrideActive =
      !!s.signedSpec?.trim() &&
      !!s.originalSignedSpec?.trim() &&
      s.signedSpec!.trim() !== s.originalSignedSpec!.trim();

    const renderOne = (spec: string) => {
      const isSigned = spec === signed;
      const gray = !isSigned;
      const showOverrideRing = isSigned && isOverrideActive;

      return (
        <button
          key={spec}
          type="button"
          disabled={!canSwitch || isSigned}
          onClick={() => {
            if (!canSwitch) return;
            if (spec === signed) return;
            void patchSignedSpec(s.id, spec);
          }}
          className={cn(
            'relative inline-flex items-center gap-0.5 shrink-0 rounded-sm',
            canSwitch && !isSigned ? 'cursor-pointer' : 'cursor-default',
            showOverrideRing && 'ring-2 ring-green-600/70 dark:ring-green-500/70 ring-offset-1 ring-offset-background'
          )}
          title={spec}
        >
          <span className={cn(gray && 'grayscale opacity-[0.85]')}>
            <CharacterSpecIconsInline mainSpec={spec} offSpec={null} size={22} slashClassName="hidden" />
          </span>
          {isSigned && s.onlySignedSpec ? (
            <span
              className="text-sm leading-none shrink-0"
              title={tRoster('specLockHint')}
              aria-label={tRoster('specLockHint')}
            >
              🔒
            </span>
          ) : null}
        </button>
      );
    };

    if (!hasOff) {
      return <span className="inline-flex items-center gap-1">{renderOne(main)}</span>;
    }
    return (
      <span className="inline-flex items-center gap-1">
        {renderOne(main)}
        {renderOne(off)}
      </span>
    );
  }

  async function addManualSignup() {
    if (!addSelected) return;
    if (usedCharacterIds.has(addSelected.id)) {
      setFormError(t('alreadyInRoster'));
      return;
    }
    setAddBusy(true);
    setFormError(null);
    try {
      const signedSpecStart = addSelected.mainSpec.trim();
      const res = await fetch(
        `/api/guilds/${encodeURIComponent(guildId)}/raids/${encodeURIComponent(raidId)}/signups/leader`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetUserId: addSelected.userId,
            characterId: addSelected.id,
            type: 'normal',
            signedSpec: signedSpecStart,
            leaderPlacement: 'confirmed',
          }),
        }
      );
      const j = (await res.json().catch(() => ({}))) as {
        signup?: {
          id: string;
          userId: string;
          characterId: string | null;
          signedSpec: string | null;
        };
      };
      if (!res.ok || !j.signup?.id) {
        throw new Error((j as { error?: string }).error || t('addError'));
      }
      const su = j.signup;
      const eff = (su.signedSpec?.trim() || signedSpecStart).trim();
      const row: RaidCompleteSignupRow = {
        id: su.id,
        userId: su.userId,
        characterId: su.characterId,
        name: addSelected.name,
        mainSpec: addSelected.mainSpec,
        offSpec: addSelected.offSpec,
        classId: getSpecByDisplayName(eff)?.classId ?? addSelected.classId,
        signedSpec: su.signedSpec ?? signedSpecStart,
        originalSignedSpec: addSelected.mainSpec.trim(),
        onlySignedSpec: false,
        isMain: addSelected.isMain,
        guildDiscordDisplayName: addSelected.guildDiscordDisplayName,
        role: (roleFromSpecDisplayName(eff) ?? addSelected.role) as TbcRole,
        signupType: 'normal',
        punctuality: 'on_time',
        isLate: false,
        forbidReserve: false,
        note: null,
        gearScore:
          typeof addSelected.gearScore === 'number'
            ? addSelected.gearScore
            : resolveGearScoreForCharacterOption(addSelected),
      };
      setSignupRows((prev) => ({ ...prev, [row.id]: row }));
      setWeights((prev) => ({ ...prev, [row.id]: 1 }));
      setGroups((prev) => prev.map((g, i) => (i === addGroupIndex ? [...g, row.id] : g)));
      setAddOpen(false);
      setAddQuery('');
      setAddSelectedId(null);
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
                  ➕ {tPlanner('addPlayer')}
                </button>
              </div>
              <div role="list" className="p-3 space-y-2">
                {g.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">{tRoster('rosterEmpty')}</p>
                ) : (
                  g.map((signupId, rosterIdx) => {
                    const s = signupRows[signupId];
                    if (!s) {
                      return (
                        <div key={signupId} className="px-3 py-2 text-sm text-destructive">
                          {signupId}
                        </div>
                      );
                    }
                    const displayDiscordName = resolveDiscordNameForRow(s);
                    const displayGearScore = resolveGearScoreForRow(s);
                    const punct = punctualityOf(s);
                    const punctLabel =
                      punct === 'on_time'
                        ? tDetail('punctualityOnTime')
                        : punct === 'tight'
                          ? tDetail('punctualityTight')
                          : tDetail('punctualityLate');
                    const attVariant = attendanceRowVariant(s);
                    const note = s.note?.trim() ?? '';
                    return (
                      <div
                        key={signupId}
                        role="listitem"
                        className={cn(
                          'flex flex-wrap items-center gap-2 rounded-lg border bg-background px-2 py-1.5 text-sm',
                          attVariant === 'default' && 'border-border',
                          attVariant === 'uncertain' && 'border-red-400/60 dark:border-red-700/55',
                          attVariant === 'declined' &&
                            'border-red-400/60 dark:border-red-800/50 bg-red-500/[0.09] dark:bg-red-950/40'
                        )}
                      >
                        <span className="tabular-nums text-muted-foreground w-10 shrink-0 font-medium inline-flex items-center gap-1">
                          <span className="w-6 text-right">{rosterIdx + 1}.</span>
                          <RoleIcon role={s.role} size={16} />
                        </span>
                        <CharacterMainStar
                          isMain={!!s.isMain}
                          titleMain={tProfile('mainLabel')}
                          titleAlt={tProfile('altLabel')}
                          sizePx={16}
                        />
                        {s.classId ? <ClassIcon classId={s.classId} size={22} /> : null}
                        {renderSpecIcons(s, true)}
                        <span className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span className="font-medium truncate">{s.name}</span>
                          <CharacterSignupPunctualityMark kind={punct} label={punctLabel} />
                          {s.forbidReserve ? (
                            <CharacterForbidReserveBadge title={tDetail('conditionForbidReserve')} pulse={false} />
                          ) : null}
                        </span>
                        <span className="ml-auto flex flex-wrap items-center gap-2">
                          <CharacterDiscordPill discordName={displayDiscordName} blink={false} />
                          <CharacterGearscorePill gearScore={displayGearScore} />
                          {note.length > 0 ? (
                            <span
                              className="shrink-0 text-base leading-none opacity-80"
                              title={note}
                              aria-label={tDetail('participantNotiz')}
                            >
                              📒
                            </span>
                          ) : null}
                          <label className="flex items-center gap-1.5 shrink-0 text-xs text-muted-foreground">
                            <span className="whitespace-nowrap">{t('weightLabel')}</span>
                            <input
                              type="number"
                              min={0}
                              max={1}
                              step={0.1}
                              className="w-16 rounded-md border border-input bg-background px-1.5 py-0.5 text-xs tabular-nums"
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
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
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

      {addOpen
        ? createPortal(
            <div className="fixed inset-0 z-[1200]">
              <div
                className="absolute inset-0 bg-black/50"
                onMouseDown={() => setAddOpen(false)}
                role="button"
                tabIndex={0}
                aria-label="Close"
              />
              <div className="absolute inset-0 flex items-start justify-center p-4 sm:p-6">
                <div
                  className="w-full max-w-lg rounded-xl border border-border bg-background shadow-xl overflow-hidden"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="border-b border-border bg-muted/20 px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">{tPlanner('addPlayer')}</p>
                      <p className="text-xs text-muted-foreground">{tRoster('addHint')}</p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-muted shrink-0"
                      onClick={() => setAddOpen(false)}
                      aria-label={tPlanner('cancel')}
                      title={tPlanner('cancel')}
                    >
                      ✕
                    </button>
                  </div>

                  <div className="p-4 space-y-3">
                    <input
                      value={addQuery}
                      onChange={(e) => {
                        setAddQuery(e.target.value);
                        setAddSelectedId(null);
                      }}
                      placeholder={tPlanner('pickChar')}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                      autoFocus
                    />

                    <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                      {addCandidates.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">{tRoster('noResults')}</p>
                      ) : (
                        <div className="divide-y divide-border">
                          {addCandidates.map((c) => {
                            const selected = addSelectedId === c.id;
                            const displayDiscordName = resolveDiscordNameForCharacterOption(c);
                            const displayGearScore = resolveGearScoreForCharacterOption(c);
                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => setAddSelectedId(c.id)}
                                className={cn(
                                  'w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2',
                                  selected && 'bg-primary/10'
                                )}
                              >
                                <CharacterMainStar
                                  isMain={!!c.isMain}
                                  titleMain={tProfile('mainLabel')}
                                  titleAlt={tProfile('altLabel')}
                                  sizePx={14}
                                />
                                {c.classId ? <ClassIcon classId={c.classId} size={18} /> : null}
                                <span className="flex items-center gap-1.5">
                                  <CharacterSpecIconsInline
                                    mainSpec={c.mainSpec}
                                    offSpec={c.offSpec}
                                    size={18}
                                    slashClassName="hidden"
                                    offSpecWrapperBaseClassName="inline-flex items-center align-middle"
                                    offSpecIconClassName="grayscale contrast-200 brightness-75"
                                  />
                                </span>
                                <span className="font-medium truncate">{c.name}</span>
                                <span className="ml-auto flex items-center gap-2">
                                  <CharacterDiscordPill discordName={displayDiscordName} />
                                  <CharacterGearscorePill gearScore={displayGearScore} />
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
                        onClick={() => setAddOpen(false)}
                      >
                        {tPlanner('cancel')}
                      </button>
                      <button
                        type="button"
                        disabled={!addSelected || addBusy}
                        className={cn(
                          'rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground',
                          (!addSelected || addBusy) && 'opacity-50 cursor-not-allowed'
                        )}
                        onClick={() => void addManualSignup()}
                      >
                        {addBusy ? '…' : tPlanner('add')}
                      </button>
                    </div>
                    {formError ? <p className="text-destructive text-sm">{formError}</p> : null}
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
