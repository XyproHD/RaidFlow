'use client';

import { useState } from 'react';
import Image from 'next/image';
import { getClassIconPath } from '@/lib/role-spec-icons';

const CLASS_LABELS: Record<string, string> = {
  druid: 'Dr', hunter: 'Jä', mage: 'Ma', paladin: 'Pa', priest: 'Pr',
  rogue: 'Sc', shaman: 'Sh', warlock: 'He', warrior: 'Kr',
};

type Props = {
  classId: string;
  className?: string;
  size?: number;
  title?: string;
};

/** Klassen-Icon. Fallback: Kürzel wenn Bild fehlt. Icons: public/icons/wow/classes/<classId>.png (mit Git committen für Deploy). */
export function ClassIcon({ classId, className = '', size = 24, title }: Props) {
  const [showFallback, setShowFallback] = useState(false);
  const src = getClassIconPath(classId);
  const fallback = CLASS_LABELS[classId] ?? classId.slice(0, 2);
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      title={title}
      aria-hidden={!title}
      role={title ? 'img' : undefined}
      aria-label={title}
      style={{ width: size, height: size }}
    >
      {!showFallback ? (
        <Image
          src={src}
          alt=""
          width={size}
          height={size}
          unoptimized
          onError={() => setShowFallback(true)}
          className="shrink-0 rounded object-contain"
        />
      ) : (
        <span
          className="flex items-center justify-center rounded bg-muted text-muted-foreground text-[10px] font-medium w-full h-full"
          aria-hidden
        >
          {fallback}
        </span>
      )}
    </span>
  );
}
