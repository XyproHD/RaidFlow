'use client';

import { useTranslations } from 'next-intl';
import { ClassIcon } from '@/components/class-icon';
import { getSpecByDisplayName } from '@/lib/wow-tbc-classes';
import { CharacterMainStar } from '@/components/character-main-star';
import { SignupSpecIcons } from '@/components/raid-detail/signup-spec-icons';
import { CharacterNameWithDiscordInline } from '@/components/character-display-parts';
export type AnmeldungRow = {
  id: string;
  userId: string;
  /** DB-Feld; für Pünktlichkeits-Anzeige (Fallback: isLate). */
  punctuality?: string | null;
  character: {
    name: string;
    mainSpec: string;
    offSpec: string | null;
    isMain: boolean;
    guildDiscordDisplayName?: string | null;
    gearScore?: number | null;
  } | null;
  signedSpec: string | null;
  type: string;
  isLate: boolean;
  note: string | null;
  leaderAllowsReserve: boolean;
  leaderMarkedTeilnehmer: boolean;
  onlySignedSpec?: boolean;
  forbidReserve?: boolean;
};

function classIdForChar(mainSpec: string): string | null {
  return getSpecByDisplayName(mainSpec)?.classId ?? null;
}

function typeLabel(t: (key: string) => string, type: string) {
  const n = type === 'main' ? 'normal' : type;
  if (n === 'normal') return t('signupType_verfugbar');
  if (n === 'uncertain') return t('signupType_uncertain');
  if (n === 'reserve') return t('signupType_reserve');
  if (n === 'declined') return t('signupType_declined');
  return t('signupType_verfugbar');
}

/**
 * Zentrale Darstellung einer Anmeldung (Icons, Name, Typ-Badges) — Planer-Listen, Raid-Ansicht, Dashboard.
 */
export function RaidSignupPlayerRow({
  row: s,
  canEdit,
  noteExpanded,
  onToggleNote,
  showTypeLabel = true,
}: {
  row: AnmeldungRow;
  canEdit: boolean;
  /** Notiz-Zeile unter der ersten Zeile (nur wenn canEdit + Notiz). */
  noteExpanded?: boolean;
  onToggleNote?: () => void;
  /** In kompakten Listen (z. B. veröffentlichter Stand) optional ausblenden. */
  showTypeLabel?: boolean;
}) {
  const t = useTranslations('raidDetail');
  const tProfile = useTranslations('profile');
  const main = s.character?.mainSpec ?? '';
  const cid = main ? classIdForChar(main) : null;
  const discordName = s.character?.guildDiscordDisplayName?.trim();

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        {s.character ? (
          <span
            className="shrink-0 w-6 flex items-center justify-center"
            title={s.character.isMain ? tProfile('mainLabel') : tProfile('altLabel')}
          >
            <CharacterMainStar
              isMain={!!s.character.isMain}
              titleMain={tProfile('mainLabel')}
              titleAlt={tProfile('altLabel')}
              sizePx={18}
            />
          </span>
        ) : (
          <span className="w-6" />
        )}
        {cid ? (
          <span className="shrink-0 flex items-center justify-center w-7 h-7">
            <ClassIcon classId={cid} size={22} title={main} />
          </span>
        ) : (
          <span className="w-7" />
        )}
        <SignupSpecIcons
          character={s.character}
          signedSpec={s.signedSpec}
          onlySignedSpec={!!s.onlySignedSpec}
          viewerIsRaidLeader={canEdit}
        />
        {s.isLate && (
          <span className="text-base shrink-0" title={t('lateCheckbox')}>
            ⏱
          </span>
        )}
        <CharacterNameWithDiscordInline
          name={s.character?.name ?? t('signupAnonymous')}
          discordName={discordName}
          className="font-medium text-foreground min-w-0 truncate"
        />
        {showTypeLabel ? (
          <span className="text-sm text-muted-foreground shrink-0">{typeLabel(t, s.type)}</span>
        ) : null}
        {s.leaderMarkedTeilnehmer && (
          <span className="text-xs rounded bg-primary/15 text-primary px-1.5 py-0.5 shrink-0">
            {t('badgeTeilnehmer')}
          </span>
        )}
        {s.onlySignedSpec && (
          <span
            className="text-xs rounded border border-amber-600/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 shrink-0 max-w-[9rem] truncate"
            title={t('badgeOnlySignedSpec')}
          >
            {t('badgeOnlySignedSpec')}
          </span>
        )}
        {s.forbidReserve && (
          <span
            className="text-xs rounded border border-muted-foreground/35 bg-muted/70 px-1.5 py-0.5 shrink-0 max-w-[9rem] truncate"
            title={t('badgeUserForbidReserve')}
          >
            {t('badgeUserForbidReserve')}
          </span>
        )}
        {!s.leaderAllowsReserve && !s.forbidReserve && (
          <span className="text-xs rounded bg-muted px-1.5 py-0.5 shrink-0">{t('badgeReserveForbidden')}</span>
        )}
        {canEdit && s.note && s.note.trim().length > 0 && onToggleNote ? (
          <button
            type="button"
            className="ml-auto shrink-0 text-lg leading-none opacity-80 hover:opacity-100"
            title={s.note}
            aria-label={t('participantNotiz')}
            onClick={onToggleNote}
          >
            📒
          </button>
        ) : null}
      </div>
      {noteExpanded && canEdit && s.note && s.note.trim().length > 0 ? (
        <div className="px-3 pb-2 text-xs text-muted-foreground border-t border-border bg-muted/30 whitespace-pre-wrap">
          {s.note}
        </div>
      ) : null}
    </>
  );
}
