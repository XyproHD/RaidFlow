'use client';

import { useTranslations } from 'next-intl';

export function StatusBanner({ message }: { message: string }) {
  const t = useTranslations('statusBanner');
  const trimmed = message.trim();
  if (!trimmed) return null;
  return (
    <div
      className="px-4 py-2 text-center text-sm bg-muted/80 text-muted-foreground border-b border-border"
      role="status"
      aria-label={t('label')}
    >
      {trimmed}
    </div>
  );
}
