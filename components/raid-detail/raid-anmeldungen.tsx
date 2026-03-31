'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ClassIcon } from '@/components/class-icon';
import { getSpecByDisplayName } from '@/lib/wow-tbc-classes';
import { CharacterMainStar } from '@/components/character-main-star';
import { SignupSpecIcons } from '@/components/raid-detail/signup-spec-icons';
import { roleFromSpecDisplayName } from '@/lib/spec-to-role';
import { RoleIcon } from '@/components/role-icon';

export type AnmeldungRow = {
  id: string;
  userId: string;
  character: {
    name: string;
    mainSpec: string;
    offSpec: string | null;
    isMain: boolean;
    guildDiscordDisplayName?: string | null;
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

const ROLE_ORDER = ['Tank', 'Melee', 'Range', 'Healer'] as const;
type RoleKey = (typeof ROLE_ORDER)[number];

function effectiveSpecForRow(r: AnmeldungRow): string | null {
  const a = r.signedSpec?.trim();
  if (a) return a;
  const b = r.character?.mainSpec?.trim();
  return b || null;
}

function roleForRow(r: AnmeldungRow): RoleKey | 'Unknown' {
  const role = roleFromSpecDisplayName(effectiveSpecForRow(r));
  if (role === 'Tank' || role === 'Melee' || role === 'Range' || role === 'Healer') return role;
  return 'Unknown';
}

export function RaidAnmeldungen({
  rows,
  canEdit,
}: {
  rows: AnmeldungRow[];
  canEdit: boolean;
}) {
  const t = useTranslations('raidDetail');
  const tProfile = useTranslations('profile');
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

  function typeLabel(type: string) {
    const n = type === 'main' ? 'normal' : type;
    if (n === 'normal') return t('signupType_verfugbar');
    if (n === 'uncertain') return t('signupType_uncertain');
    if (n === 'reserve') return t('signupType_reserve');
    return t('signupType_verfugbar');
  }

  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">—</p>;
  }

  const groups: Record<RoleKey | 'Unknown', AnmeldungRow[]> = {
    Tank: [],
    Melee: [],
    Range: [],
    Healer: [],
    Unknown: [],
  };
  for (const r of rows) {
    groups[roleForRow(r)].push(r);
  }

  return (
    <div className="space-y-4 max-w-2xl">
      {ROLE_ORDER.map((role) => {
        const list = groups[role];
        if (!list || list.length === 0) return null;
        return (
          <section key={role} className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <RoleIcon role={role} size={18} />
              <span>{role}</span>
              <span className="text-muted-foreground font-normal tabular-nums">({list.length})</span>
            </div>
            <ul className="flex flex-col gap-2">
              {list.map((s) => {
                const main = s.character?.mainSpec ?? '';
                const cid = main ? classIdForChar(main) : null;
                const discordName = s.character?.guildDiscordDisplayName?.trim();

                return (
                  <li key={s.id} className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
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
                      <span className="font-medium text-foreground min-w-0 truncate">
                        {s.character?.name ?? t('signupAnonymous')}
                        {discordName ? (
                          <span className="text-muted-foreground font-normal"> · {discordName}</span>
                        ) : null}
                      </span>
                      <span className="text-sm text-muted-foreground shrink-0">{typeLabel(s.type)}</span>
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
                        <span className="text-xs rounded bg-muted px-1.5 py-0.5 shrink-0">
                          {t('badgeReserveForbidden')}
                        </span>
                      )}
                      {canEdit && s.note && s.note.trim().length > 0 && (
                        <button
                          type="button"
                          className="ml-auto shrink-0 text-lg leading-none opacity-80 hover:opacity-100"
                          title={s.note}
                          aria-label={t('participantNotiz')}
                          onClick={() => setOpenNoteId((id) => (id === s.id ? null : s.id))}
                        >
                          📒
                        </button>
                      )}
                    </div>
                    {openNoteId === s.id && canEdit && s.note && (
                      <div className="px-3 pb-2 text-xs text-muted-foreground border-t border-border bg-muted/30 whitespace-pre-wrap">
                        {s.note}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {groups.Unknown.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="inline-flex items-center justify-center w-[18px] h-[18px] text-muted-foreground" aria-hidden>
              ?
            </span>
            <span>—</span>
            <span className="text-muted-foreground font-normal tabular-nums">({groups.Unknown.length})</span>
          </div>
          <ul className="flex flex-col gap-2">
            {groups.Unknown.map((s) => {
              const main = s.character?.mainSpec ?? '';
              const cid = main ? classIdForChar(main) : null;
              const discordName = s.character?.guildDiscordDisplayName?.trim();

              return (
                <li key={s.id} className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
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
                    <span className="font-medium text-foreground min-w-0 truncate">
                      {s.character?.name ?? t('signupAnonymous')}
                      {discordName ? (
                        <span className="text-muted-foreground font-normal"> · {discordName}</span>
                      ) : null}
                    </span>
                    <span className="text-sm text-muted-foreground shrink-0">{typeLabel(s.type)}</span>
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
                      <span className="text-xs rounded bg-muted px-1.5 py-0.5 shrink-0">
                        {t('badgeReserveForbidden')}
                      </span>
                    )}
                    {canEdit && s.note && s.note.trim().length > 0 && (
                      <button
                        type="button"
                        className="ml-auto shrink-0 text-lg leading-none opacity-80 hover:opacity-100"
                        title={s.note}
                        aria-label={t('participantNotiz')}
                        onClick={() => setOpenNoteId((id) => (id === s.id ? null : s.id))}
                      >
                        📒
                      </button>
                    )}
                  </div>
                  {openNoteId === s.id && canEdit && s.note && (
                    <div className="px-3 pb-2 text-xs text-muted-foreground border-t border-border bg-muted/30 whitespace-pre-wrap">
                      {s.note}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
