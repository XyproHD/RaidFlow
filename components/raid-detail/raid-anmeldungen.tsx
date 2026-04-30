'use client';

import { useMemo, useState } from 'react';
import { roleFromSpecDisplayName } from '@/lib/spec-to-role';
import { RoleIcon } from '@/components/role-icon';
import { TBC_CLASS_IDS } from '@/lib/wow-tbc-classes';
import type { AnmeldungRow } from '@/components/raid-detail/raid-signup-player-row';
import {
  RaidDetailSignupTableRow,
  classIdForAnmeldungRow,
  punctualityForAnmeldungRow,
} from '@/components/raid-detail/raid-detail-signup-table-row';

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

function sortRowsByClassThenName(a: AnmeldungRow, b: AnmeldungRow): number {
  const ca = classIdForAnmeldungRow(a) ?? '';
  const cb = classIdForAnmeldungRow(b) ?? '';
  const ia = TBC_CLASS_IDS.indexOf(ca);
  const ib = TBC_CLASS_IDS.indexOf(cb);
  const sa = ia >= 0 ? ia : 999;
  const sb = ib >= 0 ? ib : 999;
  if (sa !== sb) return sa - sb;
  const na = (a.character?.name ?? '').toLowerCase();
  const nb = (b.character?.name ?? '').toLowerCase();
  return na.localeCompare(nb);
}

function splitTwoColumns<T>(items: T[]): [T[], T[]] {
  if (items.length === 0) return [[], []];
  const mid = Math.ceil(items.length / 2);
  return [items.slice(0, mid), items.slice(mid)];
}

function SignupTableBlock({
  rows,
  canSeeNotes,
  openNoteId,
  setOpenNoteId,
}: {
  rows: AnmeldungRow[];
  canSeeNotes: boolean;
  openNoteId: string | null;
  setOpenNoteId: (id: string | null) => void;
}) {
  const [left, right] = useMemo(() => splitTwoColumns(rows), [rows]);

  const renderTable = (chunk: AnmeldungRow[]) => (
    <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
      <tbody>
        {chunk.map((r) => {
          const classId = classIdForAnmeldungRow(r);
          const punctuality = punctualityForAnmeldungRow(r);
          const gs = r.character?.gearScore;
          const note = r.note?.trim() ?? '';
          return (
            <RaidDetailSignupTableRow
              key={r.id}
              row={r}
              extras={{
                punctuality,
                classId,
                gearScore: typeof gs === 'number' ? gs : null,
              }}
              canSeeNotes={canSeeNotes}
              noteExpanded={openNoteId === r.id}
              onToggleNote={
                canSeeNotes && note.length > 0
                  ? () => setOpenNoteId(openNoteId === r.id ? null : r.id)
                  : undefined
              }
            />
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div className="min-w-0">
        {left.length > 0 ? renderTable(left) : <p className="text-xs text-muted-foreground py-2">—</p>}
      </div>
      <div className="min-w-0">{right.length > 0 ? renderTable(right) : null}</div>
    </div>
  );
}

export function RaidAnmeldungen({
  rows,
  canEdit,
}: {
  rows: AnmeldungRow[];
  /** Nur Raidleader sehen Teilnehmer-Notizen. */
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
  for (const k of ROLE_ORDER) {
    groups[k].sort(sortRowsByClassThenName);
  }
  groups.Unknown.sort(sortRowsByClassThenName);

  const canSeeNotes = canEdit;

  return (
    <div className="space-y-6">
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
            <SignupTableBlock
              rows={list}
              canSeeNotes={canSeeNotes}
              openNoteId={openNoteId}
              setOpenNoteId={setOpenNoteId}
            />
          </section>
        );
      })}

      {groups.Unknown.length > 0 ? (
        <section className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span
              className="inline-flex items-center justify-center w-[18px] h-[18px] text-muted-foreground"
              aria-hidden
            >
              ?
            </span>
            <span>—</span>
            <span className="text-muted-foreground font-normal tabular-nums">({groups.Unknown.length})</span>
          </div>
          <SignupTableBlock
            rows={groups.Unknown}
            canSeeNotes={canSeeNotes}
            openNoteId={openNoteId}
            setOpenNoteId={setOpenNoteId}
          />
        </section>
      ) : null}
    </div>
  );
}
