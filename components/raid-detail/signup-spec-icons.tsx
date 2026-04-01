'use client';

import { cn } from '@/lib/utils';
import { CharacterSpecIconsInline } from '@/components/character-display-parts';

type CharSpecs = {
  mainSpec: string;
  offSpec: string | null;
};

/**
 * Zwei Spec-Icons: angemeldeter Spec farbig, der andere ausgegraut.
 * Raidleader + onlySignedSpec + zwei Specs: über dem ausgegrauten Icon roter Filter.
 */
export function SignupSpecIcons({
  character,
  signedSpec,
  onlySignedSpec,
  viewerIsRaidLeader,
}: {
  character: CharSpecs | null;
  signedSpec: string | null;
  onlySignedSpec: boolean;
  viewerIsRaidLeader: boolean;
}) {
  const signed =
    signedSpec?.trim() || character?.mainSpec?.trim() || '';

  if (!character) {
    return signed ? <CharacterSpecIconsInline mainSpec={signed} offSpec={null} size={22} slashClassName="hidden" /> : null;
  }

  const main = character.mainSpec.trim();
  const off = character.offSpec?.trim() ?? '';

  const renderSpec = (spec: string) => {
    const isSigned = spec === signed;
    const gray = !isSigned;
    const redOverlay = viewerIsRaidLeader && onlySignedSpec && gray && !!off;

    return (
      <span key={spec} className="relative inline-flex shrink-0 rounded-sm">
        <span className={cn(gray && 'grayscale opacity-[0.85]')}>
          <CharacterSpecIconsInline mainSpec={spec} offSpec={null} size={22} slashClassName="hidden" />
        </span>
        {redOverlay ? (
          <span
            className="pointer-events-none absolute inset-0 rounded-sm bg-red-500/35 mix-blend-multiply"
            aria-hidden
          />
        ) : null}
      </span>
    );
  };

  if (!off) {
    return <span className="inline-flex items-center gap-1">{renderSpec(main)}</span>;
  }

  return (
    <span className="inline-flex items-center gap-1">
      {renderSpec(main)}
      {renderSpec(off)}
    </span>
  );
}
