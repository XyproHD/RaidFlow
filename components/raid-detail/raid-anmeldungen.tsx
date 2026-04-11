'use client';

import { useState } from 'react';
import { roleFromSpecDisplayName } from '@/lib/spec-to-role';
import { RoleIcon } from '@/components/role-icon';
import { RaidSignupPlayerRow, type AnmeldungRow } from '@/components/raid-detail/raid-signup-player-row';

export type { AnmeldungRow };

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
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

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

  function renderSignupLi(s: AnmeldungRow) {
    return (
      <li key={s.id} className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
        <RaidSignupPlayerRow
          row={s}
          canEdit={canEdit}
          noteExpanded={openNoteId === s.id}
          onToggleNote={
            canEdit && s.note && s.note.trim().length > 0
              ? () => setOpenNoteId((id) => (id === s.id ? null : s.id))
              : undefined
          }
        />
      </li>
    );
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
            <ul className="flex flex-col gap-2">{list.map((s) => renderSignupLi(s))}</ul>
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
          <ul className="flex flex-col gap-2">{groups.Unknown.map((s) => renderSignupLi(s))}</ul>
        </section>
      ) : null}
    </div>
  );
}
