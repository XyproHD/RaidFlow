'use client';

import Image from 'next/image';
import { getSpecIconPath } from '@/lib/role-spec-icons';

type Props = {
  spec: string;
  className?: string;
  size?: number;
};

/**
 * Spec-Icon mit Tooltip und aria-label (Accessibility).
 * Zeigt immer Icon + Spec-Name als Label.
 */
export function SpecIcon({ spec, className = '', size = 20 }: Props) {
  const src = getSpecIconPath(spec);
  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      title={spec}
      aria-label={spec}
      role="img"
    >
      <Image
        src={src}
        alt=""
        width={size}
        height={size}
        unoptimized
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = 'none';
        }}
        className="shrink-0"
      />
      <span className="sr-only">{spec}</span>
    </span>
  );
}
