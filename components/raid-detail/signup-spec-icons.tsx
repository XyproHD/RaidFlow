'use client';

import { cn } from '@/lib/utils';
import { CharacterSpecIconsInline } from '@/components/character-display-parts';

type CharSpecs = {
  mainSpec: string;
  offSpec: string | null;
};

/**
 * Zwei Spec-Icons: angemeldeter Spec farbig, der andere ausgegraut.
 * Bei Spec-Lock: 🔒 neben dem angemeldeten Spec-Icon.
 */
export function SignupSpecIcons({
  character,
  signedSpec,
  onlySignedSpec,
  specLockTitle,
  size = 22,
}: {
  character: CharSpecs | null;
  signedSpec: string | null;
  onlySignedSpec: boolean;
  /** title/aria für das 🔒 (z. B. badgeOnlySignedSpec) */
  specLockTitle: string;
  size?: number;
}) {
  const signed =
    signedSpec?.trim() || character?.mainSpec?.trim() || '';

  if (!character) {
    return signed ? <CharacterSpecIconsInline mainSpec={signed} offSpec={null} size={size} slashClassName="hidden" /> : null;
  }

  const main = character.mainSpec.trim();
  const off = character.offSpec?.trim() ?? '';

  const renderSpec = (spec: string) => {
    const isSigned = spec === signed;
    const gray = !isSigned;

    return (
      <span key={spec} className="relative inline-flex items-center gap-0.5 shrink-0 rounded-sm">
        <span className={cn(gray && 'grayscale opacity-[0.85]')}>
          <CharacterSpecIconsInline mainSpec={spec} offSpec={null} size={size} slashClassName="hidden" />
        </span>
        {isSigned && onlySignedSpec ? (
          <span className="text-sm leading-none shrink-0" title={specLockTitle} aria-label={specLockTitle}>
            🔒
          </span>
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
