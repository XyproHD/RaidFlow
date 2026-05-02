'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { getSpecByDisplayName } from '@/lib/wow-tbc-classes';
import { normalizeSignupPunctuality } from '@/lib/raid-signup-constants';
import { ClassIcon } from '@/components/class-icon';
import { CharacterMainStar } from '@/components/character-main-star';
import {
  CharacterDiscordPill,
  CharacterForbidReserveBadge,
  CharacterGearscorePill,
  CharacterSignupPunctualityMark,
  CharacterSpecIconsInline,
} from '@/components/character-display-parts';
import type { AnmeldungRow } from '@/components/raid-detail/raid-signup-player-row';

function typeNorm(v: string) {
  return v === 'main' ? 'normal' : v;
}

function attendanceRowVariant(s: AnmeldungRow): 'default' | 'uncertain' | 'declined' {
  const tn = typeNorm(s.type);
  if (tn === 'uncertain') return 'uncertain';
  if (tn === 'declined') return 'declined';
  return 'default';
}

export type DetailSignupTableRowExtras = {
  punctuality: 'on_time' | 'tight' | 'late';
  classId: string | null;
  gearScore: number | null;
};

export function RaidDetailSignupTableRow({
  row,
  extras,
  canSeeNotes,
  noteExpanded,
  onToggleNote,
}: {
  row: AnmeldungRow;
  extras: DetailSignupTableRowExtras;
  canSeeNotes: boolean;
  noteExpanded?: boolean;
  onToggleNote?: () => void;
}) {
  const t = useTranslations('raidDetail');
  const tProfile = useTranslations('profile');
  const att = attendanceRowVariant(row);
  const main = row.character?.mainSpec?.trim() ?? '';
  const off = row.character?.offSpec?.trim() ?? '';
  const signed = (row.signedSpec?.trim() || main || '').trim();
  const punct = extras.punctuality;
  const punctLabel =
    punct === 'on_time' ? t('punctualityOnTime') : punct === 'tight' ? t('punctualityTight') : t('punctualityLate');
  const discordName = row.character?.guildDiscordDisplayName?.trim() ?? null;
  const note = row.note?.trim() ?? '';

  return (
    <>
      <tr
        className={cn(
          'border-b border-border last:border-b-0',
          att === 'default' && 'bg-background',
          att === 'uncertain' && 'bg-red-500/[0.04] dark:bg-red-950/20',
          att === 'declined' && 'bg-red-500/[0.07] dark:bg-red-950/35'
        )}
      >
        <td className="px-3 py-2 align-middle">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            {row.character ? (
              <CharacterMainStar
                isMain={!!row.character.isMain}
                titleMain={tProfile('mainLabel')}
                titleAlt={tProfile('altLabel')}
                sizePx={16}
              />
            ) : null}
            {extras.classId ? <ClassIcon classId={extras.classId} size={22} title={main || undefined} /> : null}
            <CharacterSpecIconsInline
              mainSpec={signed || main || '—'}
              offSpec={off || null}
              size={20}
              slashClassName="hidden"
              offSpecWrapperClassName="grayscale contrast-90 inline-flex"
              offSpecIconClassName="opacity-90"
            />
            <span className="font-medium text-foreground truncate">{row.character?.name ?? t('signupAnonymous')}</span>
            {row.leaderMarkedTeilnehmer ? (
              <span className="text-xs rounded bg-primary/15 text-primary px-1.5 py-0.5 shrink-0">
                {t('badgeTeilnehmer')}
              </span>
            ) : null}
            {row.onlySignedSpec ? (
              <span
                className="text-xs rounded border border-amber-600/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 shrink-0 max-w-[9rem] truncate"
                title={t('badgeOnlySignedSpec')}
              >
                {t('badgeOnlySignedSpec')}
              </span>
            ) : null}
            {!row.leaderAllowsReserve && !row.forbidReserve ? (
              <span className="text-xs rounded bg-muted px-1.5 py-0.5 shrink-0">{t('badgeReserveForbidden')}</span>
            ) : null}
          </div>
        </td>
        <td className="px-3 py-2 align-middle text-right">
          <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
            <CharacterSignupPunctualityMark kind={punct} label={punctLabel} />
            {row.forbidReserve ? (
              <CharacterForbidReserveBadge title={t('conditionForbidReserve')} />
            ) : null}
            <CharacterDiscordPill discordName={discordName} />
            <CharacterGearscorePill gearScore={extras.gearScore} />
            {canSeeNotes && note.length > 0 && onToggleNote ? (
              <button
                type="button"
                className="shrink-0 text-base leading-none opacity-80 hover:opacity-100"
                title={note}
                aria-label={t('participantNotiz')}
                onClick={onToggleNote}
              >
                📒
              </button>
            ) : null}
          </div>
        </td>
      </tr>
      {noteExpanded && canSeeNotes && note.length > 0 ? (
        <tr className="border-b border-border bg-muted/30 last:border-b-0">
          <td colSpan={2} className="px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap">
            {note}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** Hilfsfunktion für Parent: Pünktlichkeit aus Zeile + Legacy isLate. */
export function punctualityForAnmeldungRow(row: AnmeldungRow & { punctuality?: string | null }): 'on_time' | 'tight' | 'late' {
  return normalizeSignupPunctuality(row.punctuality, row.isLate);
}

export function classIdForAnmeldungRow(row: AnmeldungRow): string | null {
  const spec = (row.signedSpec?.trim() || row.character?.mainSpec?.trim() || '').trim();
  if (!spec) return null;
  return getSpecByDisplayName(spec)?.classId ?? null;
}
