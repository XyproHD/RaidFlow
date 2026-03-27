'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { getRoleIcon } from '@/lib/role-spec-icons';

type Props = {
  role: string;
  className?: string;
  size?: number;
};

/**
 * Rollen-Icon (Tank, Melee, Range, Healer) mit Tooltip und aria-label.
 */
export function RoleIcon({ role, className = '', size = 20 }: Props) {
  const t = useTranslations('profile');
  const { src, labelKey } = getRoleIcon(role);
  const label = t(labelKey as 'roleTank');
  return (
    <span
      className={`inline-flex items-center gap-1 ${className}`}
      title={label}
      aria-label={label}
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
      <span className="sr-only">{label}</span>
    </span>
  );
}
