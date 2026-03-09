'use client';

import Image from 'next/image';
import { getClassIconPath } from '@/lib/role-spec-icons';

type Props = {
  classId: string;
  className?: string;
  size?: number;
  title?: string;
};

/** Klassen-Icon (z. B. Druide, Magier). Icons aus C:\tmp\wow\classes\ nach public/icons/wow/classes/ kopieren. */
export function ClassIcon({ classId, className = '', size = 24, title }: Props) {
  const src = getClassIconPath(classId);
  return (
    <span
      className={`inline-flex shrink-0 ${className}`}
      title={title}
      aria-hidden={!title}
      role={title ? 'img' : undefined}
      aria-label={title}
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
        className="shrink-0 rounded object-contain"
      />
    </span>
  );
}
