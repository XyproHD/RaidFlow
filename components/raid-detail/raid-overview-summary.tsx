'use client';

import type { ReactNode } from 'react';
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

function RoleTile({
  roleKey,
  children,
  classRows,
  tProfile,
}: {
  roleKey: (typeof ROLE_KEYS)[number];
  children: ReactNode;
  classRows: RoleClassCountRow[];
  tProfile: (key: string) => string;
}) {
  const icon = ROLE_ICONS[roleKey];
  return (
    <div
      className="flex flex-col rounded-md border border-border/80 bg-background px-2 py-2 text-sm min-w-0"
      title={roleKey}
    >
      <div className="inline-flex flex-wrap items-center justify-center gap-1.5 tabular-nums w-full">
        <Image src={icon.src} alt="" width={18} height={18} unoptimized />
        {children}
      </div>
      <RoleClassGrid rows={classRows} tProfile={tProfile} />
    </div>
  );
}

function OverviewRowBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border/80 bg-background/60 p-3 space-y-2 min-w-0">
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="grid grid-cols-2 gap-2 min-w-0">{children}</div>
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

  const minSpecEntries =
    minSpecsObj && Object.keys(minSpecsObj).length > 0
      ? Object.entries(minSpecsObj).filter(
          ([, need]) => typeof need === 'number' && Number.isFinite(need) && need > 0
        )
      : [];

  return (
    <div className="flex flex-col gap-3 min-w-0 w-full">
      <OverviewRowBox label={t('overviewRowSignups')}>
        {ROLE_KEYS.map((key) => {
          const slice = roleAttendance[key];
          const classRows = roleClassByRole[key] ?? [];
          return (
            <RoleTile key={key} roleKey={key} classRows={classRows} tProfile={tProfile}>
              <AttendanceCounts {...slice} />
            </RoleTile>
          );
        })}
      </OverviewRowBox>

      <OverviewRowBox label={t('overviewRowMinRoles')}>
        {ROLE_KEYS.map((key) => {
          const min = roleMinByKey[key];
          const slice = roleAttendance[key];
          const classRows = roleClassByRole[key] ?? [];
          return (
            <RoleTile key={key} roleKey={key} classRows={classRows} tProfile={tProfile}>
              <span className={cn('font-semibold', statusToneClassForMin(min, slice.clear, slice.unclear))}>
                {min}
              </span>
              <span className="text-muted-foreground">·</span>
              <AttendanceCounts {...slice} />
            </RoleTile>
          );
        })}
      </OverviewRowBox>

      {minSpecEntries.length > 0 ? (
        <OverviewRowBox label={t('overviewRowMinSpecs')}>
          {minSpecEntries.map(([spec, need]) => {
            const slice = specAttendanceByKey[spec] ?? { clear: 0, unclear: 0 };
            const classId = parseMinSpecClassKey(spec);
            const title = minSpecKeyTitle(spec, tProfile);
            return (
              <span
                key={spec}
                className="flex flex-col rounded-md border border-border/80 bg-background px-2 py-2 text-sm min-w-0"
                title={title}
              >
                <span className="inline-flex flex-wrap items-center justify-center gap-1.5 tabular-nums w-full">
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
              </span>
            );
          })}
        </OverviewRowBox>
      ) : null}
    </div>
  );
}
