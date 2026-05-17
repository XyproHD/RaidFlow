'use client';

import { cn } from '@/lib/utils';
import { PLANNER_PARTY_SIZE } from '@/lib/planner-party-slots';
import type { RosterPlannerSignup } from '@/components/raid-planner/raid-roster-planner';
import { ClassIcon } from '@/components/class-icon';
import { SpecIcon } from '@/components/spec-icon';

type PlannerPartyGridProps = {
  groupIndex: number;
  partySlots: string[][];
  byId: Map<string, RosterPlannerSignup>;
  tPartyTitle: (n: number) => string;
  onPointerDown: (e: React.PointerEvent, signupId: string, source: 'party') => void;
  draggingId: string | null;
};

export function PlannerPartyGrid({
  groupIndex,
  partySlots,
  byId,
  tPartyTitle,
  onPointerDown,
  draggingId,
}: PlannerPartyGridProps) {
  if (partySlots.length === 0) return null;

  return (
    <div className="border-t border-border/80 px-3 py-2 space-y-2">
      {partySlots.map((slot, partyIndex) => (
        <div
          key={`party-${groupIndex}-${partyIndex}`}
          data-drop-zone="party"
          data-roster-group={String(groupIndex)}
          data-party-index={String(partyIndex)}
          className="space-y-1"
        >
          <p className="text-[11px] font-medium text-muted-foreground">
            {tPartyTitle(partyIndex + 1)}
          </p>
          <div className="grid grid-cols-5 gap-px rounded-md overflow-hidden bg-border/60">
            {Array.from({ length: PLANNER_PARTY_SIZE }, (_, cell) => {
              const id = slot[cell];
              const s = id ? byId.get(id) : null;
              return (
                <div
                  key={cell}
                  data-drop-zone="party"
                  data-roster-group={String(groupIndex)}
                  data-party-index={String(partyIndex)}
                  data-party-cell={String(cell)}
                  className={cn(
                    'min-h-[2.25rem] bg-background/90 px-1 py-0.5 flex items-center justify-center',
                    !s && 'bg-muted/20'
                  )}
                >
                  {s ? (
                    <button
                      type="button"
                      data-planner-row
                      data-signup-id={s.id}
                      className={cn(
                        'w-full truncate text-[10px] leading-tight font-medium text-foreground cursor-grab active:cursor-grabbing touch-none',
                        draggingId === s.id && 'opacity-25'
                      )}
                      title={s.name}
                      onPointerDown={(e) => onPointerDown(e, s.id, 'party')}
                    >
                      <span className="inline-flex items-center gap-0.5 max-w-full justify-center">
                        {s.classId ? (
                          <ClassIcon classId={s.classId} size={14} className="shrink-0" />
                        ) : (
                          <SpecIcon
                            spec={s.signedSpec?.trim() || s.mainSpec}
                            size={14}
                            className="shrink-0"
                          />
                        )}
                        <span className="truncate">{s.name}</span>
                      </span>
                    </button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/40 select-none" aria-hidden>
                      ·
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
