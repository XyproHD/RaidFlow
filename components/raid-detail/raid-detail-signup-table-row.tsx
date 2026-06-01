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
} from '@/components/character-display-parts';
import { SignupSpecIcons } from '@/components/raid-detail/signup-spec-icons';
import { RAID_DETAIL_ICON_SIZE } from '@/components/raid-detail/raid-detail-display';
import type { AnmeldungRow } from '@/components/raid-detail/raid-signup-player-row';

function typeNorm(v: string) {
  return v === 'main' ? 'normal' : v;
}

function attendanceRowVariant(s: AnmeldungRow, raidStatus: string): 'default' | 'uncertain' | 'declined' {
  if (raidStatus === 'cancelled') return 'declined';
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
  raidStatus = '',
  slotNumber,
  compact = false,
}: {
  row: AnmeldungRow;
  extras: DetailSignupTableRowExtras;
  canSeeNotes: boolean;
  noteExpanded?: boolean;
  onToggleNote?: () => void;
  raidStatus?: string;
  /** Position in der 5er-Gruppe (1–5). */
  slotNumber?: number;
  /** Einzeilig ohne Umbruch (veröffentlichte 5er). */
  compact?: boolean;
}) {
  const t = useTranslations('raidDetail');
  const tProfile = useTranslations('profile');
  const att = attendanceRowVariant(row, raidStatus);
  const main = row.character?.mainSpec?.trim() ?? '';
  const punct = extras.punctuality;
  const punctLabel =
    punct === 'on_time' ? t('punctualityOnTime') : punct === 'tight' ? t('punctualityTight') : t('punctualityLate');
  const discordName = row.character?.guildDiscordDisplayName?.trim() ?? null;
  const note = row.note?.trim() ?? '';
  const iconSize = RAID_DETAIL_ICON_SIZE;

  const nameBlock = (
    <div
      className={cn(
        'flex items-center gap-1.5 min-w-0',
        compact ? 'flex-nowrap overflow-hidden' : 'flex-wrap'
      )}
    >
      {row.character ? (
        <CharacterMainStar
          isMain={!!row.character.isMain}
          titleMain={tProfile('mainLabel')}
          titleAlt={tProfile('altLabel')}
          sizePx={iconSize}
        />
      ) : null}
      {extras.classId ? <ClassIcon classId={extras.classId} size={iconSize} title={main || undefined} /> : null}
      <SignupSpecIcons
        character={row.character}
        signedSpec={row.signedSpec}
        onlySignedSpec={!!row.onlySignedSpec}
        specLockTitle={t('badgeOnlySignedSpec')}
        size={iconSize}
      />
      <span className={cn('font-medium text-foreground', compact ? 'truncate min-w-0' : '')}>
        {row.character?.name ?? t('signupAnonymous')}
      </span>
      {row.leaderMarkedTeilnehmer ? (
        <span className="text-xs rounded bg-primary/15 text-primary px-1.5 py-0.5 shrink-0 whitespace-nowrap">
          {t('badgeTeilnehmer')}
        </span>
      ) : null}
      {!row.leaderAllowsReserve && !row.forbidReserve ? (
        <span className="text-xs rounded bg-muted px-1.5 py-0.5 shrink-0 whitespace-nowrap">
          {t('badgeReserveForbidden')}
        </span>
      ) : null}
    </div>
  );

  const trailingBlock = (
    <div className="inline-flex flex-nowrap items-center gap-1.5 shrink-0">
      <CharacterSignupPunctualityMark kind={punct} label={punctLabel} className="h-[18px] items-center" />
      {row.forbidReserve ? <CharacterForbidReserveBadge title={t('conditionForbidReserve')} /> : null}
      <CharacterDiscordPill discordName={discordName} />
      <CharacterGearscorePill gearScore={extras.gearScore} />
      {canSeeNotes && note.length > 0 && onToggleNote ? (
        <button
          type="button"
          className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center text-sm leading-none opacity-80 hover:opacity-100"
          title={note}
          aria-label={t('participantNotiz')}
          onClick={onToggleNote}
        >
          📒
        </button>
      ) : null}
    </div>
  );

  return (
    <>
      <tr
        className={cn(
          'border-b border-border last:border-b-0',
          compact && 'min-h-[34px]',
          att === 'default' && 'bg-background',
          att === 'uncertain' && 'bg-red-500/[0.04] dark:bg-red-950/20',
          att === 'declined' && 'bg-red-500/[0.07] dark:bg-red-950/35'
        )}
      >
        {slotNumber != null ? (
          <td className="w-8 px-2 py-1.5 align-middle text-xs font-semibold text-muted-foreground tabular-nums text-center">
            {slotNumber}
          </td>
        ) : null}
        <td
          className={cn('align-middle', compact ? 'px-2 py-1.5 whitespace-nowrap' : 'px-3 py-2')}
          colSpan={compact && slotNumber == null ? 2 : 1}
        >
          {compact ? (
            <div className="flex flex-nowrap items-center gap-2 min-w-0">
              {nameBlock}
              {trailingBlock}
            </div>
          ) : (
            nameBlock
          )}
        </td>
        {!compact ? (
          <td className="px-3 py-2 align-middle text-right">{trailingBlock}</td>
        ) : null}
      </tr>
      {noteExpanded && canSeeNotes && note.length > 0 ? (
        <tr className="border-b border-border bg-muted/30 last:border-b-0">
          <td colSpan={slotNumber != null ? 3 : 2} className="px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap">
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
