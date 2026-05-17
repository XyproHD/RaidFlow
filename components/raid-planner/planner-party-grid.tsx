'use client';

import { cn } from '@/lib/utils';
import { PLANNER_PARTY_SIZE } from '@/lib/planner-party-slots';

type PlannerPartyInlineProps = {
  groupIndex: number;
  partySlots: string[][];
  tPartyTitle: (n: number) => string;
  renderSignup: (signupId: string, partyIndex: number, cellIndex: number) => React.ReactNode;
};

/** 5er-Untergruppen inline in der Raid-Gruppen-Karte (volle Spielerzeilen). */
export function PlannerPartyInline({
  groupIndex,
  partySlots,
  tPartyTitle,
  renderSignup,
}: PlannerPartyInlineProps) {
  if (partySlots.length === 0) return null;

  return (
    <div className="px-3 pb-3 pt-1 space-y-3">
      {partySlots.map((row, partyIndex) => (
        <div key={`party-${groupIndex}-${partyIndex}`} className="space-y-1.5">
          <p className="text-[11px] font-medium text-muted-foreground px-0.5">
            {tPartyTitle(partyIndex + 1)}
          </p>
          <div className="space-y-1.5" role="list">
            {Array.from({ length: PLANNER_PARTY_SIZE }, (_, cellIndex) => {
              const id = row[cellIndex]?.trim() ?? '';
              const hasPlayer = id.length > 0;
              return (
                <div
                  key={`${groupIndex}-${partyIndex}-${cellIndex}`}
                  data-drop-zone="party"
                  data-roster-group={String(groupIndex)}
                  data-party-index={String(partyIndex)}
                  data-party-cell={String(cellIndex)}
                  className={cn(!hasPlayer && 'min-h-[2.5rem]')}
                >
                  {hasPlayer ? (
                    renderSignup(id, partyIndex, cellIndex)
                  ) : (
                    <div
                      data-drop-zone="party"
                      data-roster-group={String(groupIndex)}
                      data-party-index={String(partyIndex)}
                      data-party-cell={String(cellIndex)}
                      className="min-h-[2.5rem] rounded-lg border border-dashed border-border/50 bg-muted/15"
                      aria-hidden
                    />
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
