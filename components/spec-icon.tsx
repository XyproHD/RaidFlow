'use client';

import { useState } from 'react';
import Image from 'next/image';
import { getSpecIconPath } from '@/lib/role-spec-icons';

/** Kürzel aus Spec-Anzeigename (z. B. "Fire Mage" -> "FM"). */
function specAbbrev(spec: string): string {
  const parts = spec.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] ?? '') + (parts[1][0] ?? '');
  return spec.slice(0, 2) || '?';
}

type Props = {
  spec: string;
  className?: string;
  size?: number;
};

/**
 * Spec-Icon mit Fallback-Kürzel wenn Bild fehlt. Icons: public/icons/wow/specs/*.png (mit Git committen für Deploy).
 */
export function SpecIcon({ spec, className = '', size = 20 }: Props) {
  const [showFallback, setShowFallback] = useState(false);
  const src = getSpecIconPath(spec);
  const abbrev = specAbbrev(spec);
  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      title={spec}
      aria-label={spec}
      role="img"
    >
      {!showFallback ? (
        <Image
          src={src}
          alt=""
          width={size}
          height={size}
          unoptimized
          onError={() => setShowFallback(true)}
          className="shrink-0"
        />
      ) : (
        <span
          className="flex shrink-0 items-center justify-center rounded bg-muted text-muted-foreground text-[10px] font-medium"
          style={{ width: size, height: size }}
          aria-hidden
        >
          {abbrev}
        </span>
      )}
      <span className="sr-only">{spec}</span>
    </span>
  );
}
