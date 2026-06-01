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
    <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1.5 mt-1 border-t border-border/60 w-full">
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

function RoleCell({
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
    <td className="align-top border-r border-border/60 last:border-r-0 px-2 py-2 min-w-0 bg-background">
      <div className="inline-flex flex-wrap items-center justify-center gap-1.5 tabular-nums w-full text-sm" title={roleKey}>
        <Image src={icon.src} alt="" width={18} height={18} unoptimized />
        {children}
      </div>
      <RoleClassGrid rows={classRows} tProfile={tProfile} />
    </td>
  );
}

function OverviewTableRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <th
        scope="row"
        className="align-top text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide py-2.5 pr-3 w-[7.5rem] min-w-[7.5rem] font-normal"
      >
        {label}
      </th>
      <td className="py-1.5 pl-0 pr-0">
        <table className="w-full text-sm border-collapse border border-border/80 rounded overflow-hidden">
          <tbody>
            <tr>{children}</tr>
          </tbody>
        </table>
      </td>
    </tr>
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
    <table className="w-full text-sm border-collapse min-w-0">
      <tbody>
        <OverviewTableRow label={t('overviewRowSignups')}>
          {ROLE_KEYS.map((key) => {
            const slice = roleAttendance[key];
            const classRows = roleClassByRole[key] ?? [];
            return (
              <RoleCell key={key} roleKey={key} classRows={classRows} tProfile={tProfile}>
                <AttendanceCounts {...slice} />
              </RoleCell>
            );
          })}
        </OverviewTableRow>

        <OverviewTableRow label={t('overviewRowMinRoles')}>
          {ROLE_KEYS.map((key) => {
            const min = roleMinByKey[key];
            const slice = roleAttendance[key];
            const classRows = roleClassByRole[key] ?? [];
            return (
              <RoleCell key={key} roleKey={key} classRows={classRows} tProfile={tProfile}>
                <span className={cn('font-semibold', statusToneClassForMin(min, slice.clear, slice.unclear))}>
                  {min}
                </span>
                <span className="text-muted-foreground">·</span>
                <AttendanceCounts {...slice} />
              </RoleCell>
            );
          })}
        </OverviewTableRow>

        {minSpecEntries.length > 0 ? (
          <OverviewTableRow label={t('overviewRowMinSpecs')}>
            {minSpecEntries.map(([spec, need]) => {
              const slice = specAttendanceByKey[spec] ?? { clear: 0, unclear: 0 };
              const classId = parseMinSpecClassKey(spec);
              const title = minSpecKeyTitle(spec, tProfile);
              return (
                <td
                  key={spec}
                  className="align-top border-r border-border/60 last:border-r-0 px-2 py-2 min-w-0 bg-background"
                  title={title}
                >
                  <span className="inline-flex flex-wrap items-center justify-center gap-1.5 tabular-nums w-full text-sm">
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
                </td>
              );
            })}
          </OverviewTableRow>
        ) : null}
      </tbody>
    </table>
  );
}
