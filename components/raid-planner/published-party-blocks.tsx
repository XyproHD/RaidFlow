'use client';

import { PLANNER_PARTY_SIZE } from '@/lib/planner-party-slots';
import { cn } from '@/lib/utils';

type PublishedPartyBlocksProps = {
  partySlots: string[][];
  resolveName: (signupId: string) => string | null;
  partyTitle: (n: number) => string;
  className?: string;
};

/** Kompakte 5er-Anzeige (Raid-Ansicht / Discord-Vorschau). */
export function PublishedPartyBlocks({
  partySlots,
  resolveName,
  partyTitle,
  className,
}: PublishedPartyBlocksProps) {
  const slots = partySlots.filter((row) => row.some((id) => resolveName(id)));
  if (slots.length === 0) return null;

  return (
    <div className={cn('space-y-2', className)}>
      {slots.map((row, pi) => (
        <div key={`pub-party-${pi}`} className="space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">{partyTitle(pi + 1)}</p>
          <div className="grid grid-cols-5 gap-px rounded-md overflow-hidden bg-border/50 text-[10px]">
            {Array.from({ length: PLANNER_PARTY_SIZE }, (_, cell) => {
              const id = row[cell];
              const name = id ? resolveName(id) : null;
              return (
                <div
                  key={cell}
                  className={cn(
                    'min-h-[1.75rem] px-0.5 py-0.5 flex items-center justify-center bg-background/90',
                    !name && 'text-muted-foreground/40'
                  )}
                >
                  <span className="truncate w-full text-center">{name ?? '·'}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
