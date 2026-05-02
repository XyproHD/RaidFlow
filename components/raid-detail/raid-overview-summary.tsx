'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { ROLE_ICONS } from '@/lib/role-spec-icons';
import Image from 'next/image';
import { ClassIcon } from '@/components/class-icon';
import { SpecIcon } from '@/components/spec-icon';
import { minSpecKeyTitle, parseMinSpecClassKey } from '@/lib/min-spec-keys';
import type { OverviewAttendanceSlice, RoleClassCountRow } from '@/lib/raid-overview-attendance';

const ROLE_KEYS = ['Tank', 'Melee', 'Range', 'Healer'] as const;

const MIN_SPEC_CLASS_PROFILE_KEY: Record<string, string> = {
  druid: 'classDruid',
  hunter: 'classHunter',
  mage: 'classMage',
  paladin: 'classPaladin',
  priest: 'classPriest',
  rogue: 'classRogue',
  shaman: 'classShaman',
  warlock: 'classWarlock',
  warrior: 'classWarrior',
};

function statusToneClassForMin(min: number, clear: number, unclear: number): string {
  if (min <= 0) return 'text-muted-foreground';
  if (clear >= min) return 'text-green-600 dark:text-green-500';
  if (clear + unclear < min) return 'text-destructive';
  return 'text-amber-600 dark:text-amber-500';
}

export type RaidOverviewSummaryProps = {
  roleAttendance: Record<(typeof ROLE_KEYS)[number], OverviewAttendanceSlice>;
  roleClassByRole: Record<(typeof ROLE_KEYS)[number], RoleClassCountRow[]>;
  roleMinByKey: Record<(typeof ROLE_KEYS)[number], number>;
  minSpecsObj: Record<string, number> | null;
  specAttendanceByKey: Record<string, OverviewAttendanceSlice>;
};

function AttendanceCounts({ clear, unclear }: OverviewAttendanceSlice) {
  return (
    <>
      <span className="font-semibold tabular-nums text-green-600 dark:text-green-500">{clear}</span>
      <span className="text-muted-foreground">/</span>
      <span className="font-semibold tabular-nums text-orange-600 dark:text-orange-500">{unclear}</span>
    </>
  );
}

function RoleClassGrid({
  rows,
  tProfile,
}: {
  rows: RoleClassCountRow[];
  tProfile: (key: string) => string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 pt-2 mt-1 border-t border-border/70 w-full">
      {rows.map(({ classId, total }) => (
        <span
          key={classId}
          className="inline-flex items-center gap-1.5 min-w-0 tabular-nums"
          title={tProfile(MIN_SPEC_CLASS_PROFILE_KEY[classId] ?? 'classWarrior')}
        >
          <ClassIcon classId={classId} size={16} title={undefined} />
          <span className="text-xs font-semibold text-foreground">{total}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Übersichtszeilen (Anmeldungen / Min. Rollen / Min. Specs) — Raid-Detail & Planer.
 */
export function RaidOverviewSummaryRows({
  roleAttendance,
  roleClassByRole,
  roleMinByKey,
  minSpecsObj,
  specAttendanceByKey,
}: RaidOverviewSummaryProps) {
  const t = useTranslations('raidDetail');
  const tProfile = useTranslations('profile');

  return (
    <div className="grid gap-y-3 gap-x-3 sm:gap-x-4 sm:ml-auto w-full sm:w-auto">
      <div className="grid grid-cols-[7.5rem_1fr] items-start gap-x-3">
        <div className="text-xs font-medium text-muted-foreground pt-1">{t('overviewRowSignups')}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 justify-items-stretch min-w-0">
          {ROLE_KEYS.map((key) => {
            const slice = roleAttendance[key];
            const icon = ROLE_ICONS[key];
            const classRows = roleClassByRole[key] ?? [];
            return (
              <div
                key={key}
                className="flex flex-col rounded-md border border-border bg-background px-2 py-2 text-sm min-w-0"
                title={key}
              >
                <div className="inline-flex flex-wrap items-center justify-center gap-1.5 tabular-nums w-full">
                  <Image src={icon.src} alt="" width={18} height={18} unoptimized />
                  <AttendanceCounts {...slice} />
                </div>
                <RoleClassGrid rows={classRows} tProfile={tProfile} />
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-[7.5rem_1fr] items-start gap-x-3">
        <div className="text-xs font-medium text-muted-foreground pt-1">{t('overviewRowMinRoles')}</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 justify-items-stretch min-w-0">
          {ROLE_KEYS.map((key) => {
            const min = roleMinByKey[key];
            const slice = roleAttendance[key];
            const classRows = roleClassByRole[key] ?? [];
            return (
              <div
                key={key}
                className="flex flex-col rounded-md border border-border bg-background px-2 py-2 text-sm min-w-0"
                title={key}
              >
                <div className="inline-flex flex-wrap items-center justify-center gap-1.5 tabular-nums w-full">
                  <Image src={ROLE_ICONS[key].src} alt="" width={18} height={18} unoptimized />
                  <span className={cn('font-semibold', statusToneClassForMin(min, slice.clear, slice.unclear))}>
                    {min}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <AttendanceCounts {...slice} />
                </div>
                <RoleClassGrid rows={classRows} tProfile={tProfile} />
              </div>
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
                  const slice = specAttendanceByKey[spec] ?? { clear: 0, unclear: 0 };
                  const classId = parseMinSpecClassKey(spec);
                  const title = minSpecKeyTitle(spec, tProfile);
                  return (
                    <span
                      key={spec}
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-sm tabular-nums"
                      title={title}
                    >
                      {classId ? (
                        <ClassIcon classId={classId} size={18} title={title} />
                      ) : (
                        <SpecIcon spec={spec} size={18} />
                      )}
                      <span className={cn('font-semibold', statusToneClassForMin(need, slice.clear, slice.unclear))}>
                        {need}
                      </span>
                      <span className="text-muted-foreground">·</span>
                      <AttendanceCounts {...slice} />
                    </span>
                  );
                })
            : null}
        </div>
      </div>
    </div>
  );
}
