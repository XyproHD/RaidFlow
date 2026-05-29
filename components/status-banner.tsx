'use client';

import { useTranslations } from 'next-intl';

export function StatusBanner({ message }: { message: string }) {
  const t = useTranslations('statusBanner');
  const trimmed = message.trim();
  if (!trimmed) return null;
  return (
    <div
      className="py-2.5 text-center text-sm bg-primary/10 text-foreground border-b border-primary/20 font-medium"
      role="status"
      aria-label={t('label')}
    >
      <p className="page-container px-0">{trimmed}</p>
    </div>
  );
}
