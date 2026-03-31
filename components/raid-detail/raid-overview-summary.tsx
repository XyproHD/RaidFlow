'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { ROLE_ICONS } from '@/lib/role-spec-icons';
import Image from 'next/image';
import { SpecIcon } from '@/components/spec-icon';

const ROLE_KEYS = ['Tank', 'Melee', 'Range', 'Healer'] as const;

type RoleStat = { normal: number; uncertain: number; reserve: number };

function statusToneClass(args: {
  min: number;
  normal: number;
  uncertain: number;
  reserve: number;
}): string {
  const { min, normal, uncertain, reserve } = args;
  if (min <= 0) return 'text-muted-foreground';
  if (normal >= min) return 'text-green-600 dark:text-green-500';
  if (normal + uncertain + reserve < min) return 'text-destructive';
  return 'text-amber-600 dark:text-amber-500';
}

export type RaidOverviewSummaryProps = {
  roleStats: Record<(typeof ROLE_KEYS)[number], RoleStat>;
  roleMinByKey: Record<(typeof ROLE_KEYS)[number], number>;
  minSpecsObj: Record<string, number> | null;
  specCountsByType: Record<string, RoleStat>;
};

/**
 * Nur die Übersichtszeilen (Anmeldungen / Min. Rollen / Min. Specs) — wie in der Raid-Detail-Ansicht.
 */
export function RaidOverviewSummaryRows({
  roleStats,
  roleMinByKey,
  minSpecsObj,
  specCountsByType,
}: RaidOverviewSummaryProps) {
  const t = useTranslations('raidDetail');

  return (
    <div className="grid gap-y-2 gap-x-3 sm:gap-x-4 sm:ml-auto w-full sm:w-auto">
      <div className="grid grid-cols-[7.5rem_1fr] items-start gap-x-3">
        <div className="text-xs font-medium text-muted-foreground pt-1">{t('overviewRowSignups')}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 justify-items-stretch">
          {ROLE_KEYS.map((key) => {
            const stats = roleStats[key];
            const icon = ROLE_ICONS[key];
            return (
              <span
                key={key}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-sm tabular-nums"
                title={key}
              >
                <Image src={icon.src} alt="" width={18} height={18} unoptimized />
                <span className="font-semibold text-green-600 dark:text-green-500">{stats.normal}</span>
                <span className="text-muted-foreground">(</span>
                <span className="font-semibold text-amber-600 dark:text-amber-500">{stats.uncertain}</span>
                <span className="text-muted-foreground"> / </span>
                <span className="font-semibold text-muted-foreground">{stats.reserve}</span>
                <span className="text-muted-foreground">)</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-[7.5rem_1fr] items-start gap-x-3">
        <div className="text-xs font-medium text-muted-foreground pt-1">{t('overviewRowMinRoles')}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 justify-items-stretch">
          {ROLE_KEYS.map((key) => {
            const min = roleMinByKey[key];
            const stats = roleStats[key];
            return (
              <span
                key={key}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-sm tabular-nums"
                title={key}
              >
                <Image src={ROLE_ICONS[key].src} alt="" width={18} height={18} unoptimized />
                <span className={cn('font-semibold', statusToneClass({ min, ...stats }))}>{min}</span>
                <span className="text-muted-foreground">/</span>
                <span className="font-semibold text-green-600 dark:text-green-500">{stats.normal}</span>
                <span className="text-muted-foreground">(</span>
                <span className="font-semibold text-amber-600 dark:text-amber-500">{stats.uncertain}</span>
                <span className="text-muted-foreground"> / </span>
                <span className="font-semibold text-muted-foreground">{stats.reserve}</span>
                <span className="text-muted-foreground">)</span>
              </span>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-[7.5rem_1fr] items-start gap-x-3">
        <div className="text-xs font-medium text-muted-foreground pt-1">{t('overviewRowMinSpecs')}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 justify-items-stretch">
          {minSpecsObj && Object.keys(minSpecsObj).length > 0
            ? Object.entries(minSpecsObj)
                .filter(([, need]) => typeof need === 'number' && Number.isFinite(need) && need > 0)
                .map(([spec, need]) => {
                  const stats = specCountsByType[spec] ?? { normal: 0, uncertain: 0, reserve: 0 };
                  return (
                    <span
                      key={spec}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-sm tabular-nums"
                      title={spec}
                    >
                      <SpecIcon spec={spec} size={18} />
                      <span className={cn('font-semibold', statusToneClass({ min: need, ...stats }))}>
                        {need}
                      </span>
                      <span className="text-muted-foreground">/</span>
                      <span className="font-semibold text-green-600 dark:text-green-500">{stats.normal}</span>
                      <span className="text-muted-foreground">(</span>
                      <span className="font-semibold text-amber-600 dark:text-amber-500">{stats.uncertain}</span>
                      <span className="text-muted-foreground"> / </span>
                      <span className="font-semibold text-muted-foreground">{stats.reserve}</span>
                      <span className="text-muted-foreground">)</span>
                    </span>
                  );
                })
            : null}
        </div>
      </div>
    </div>
  );
}
