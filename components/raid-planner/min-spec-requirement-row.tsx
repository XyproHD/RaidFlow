'use client';

import { ClassIcon } from '@/components/class-icon';
import { SpecIcon } from '@/components/spec-icon';
import { getClassSpecs, getSpecDisplayName, TBC_CLASS_IDS } from '@/lib/wow-tbc-classes';
import {
  MIN_SPEC_CLASS_ONLY,
  normalizeMinSpecRow,
  type MinSpecRowForm,
} from '@/lib/min-spec-keys';

const CLASS_I18N_KEYS = {
  druid: 'classDruid',
  hunter: 'classHunter',
  mage: 'classMage',
  paladin: 'classPaladin',
  priest: 'classPriest',
  rogue: 'classRogue',
  shaman: 'classShaman',
  warlock: 'classWarlock',
  warrior: 'classWarrior',
} as const;

type TFn = (key: string, values?: Record<string, string>) => string;

export function MinSpecRequirementRow({
  row,
  onChange,
  onRemove,
  removeLabel,
  countMin = 1,
  countMax = 10,
  countInputClassName,
  t,
  tProfile,
  variant = 'wizard',
}: {
  row: MinSpecRowForm;
  onChange: (next: MinSpecRowForm) => void;
  onRemove: () => void;
  removeLabel: string;
  countMin?: number;
  countMax?: number;
  countInputClassName?: string;
  t: TFn;
  tProfile: TFn;
  variant?: 'wizard' | 'edit';
}) {
  const rowN = normalizeMinSpecRow(row);
  const classSpecs = getClassSpecs(rowN.classId);
  const specIdsValid = new Set(classSpecs.map((s) => s.id));
  const selectValue =
    rowN.specChoice === MIN_SPEC_CLASS_ONLY || !specIdsValid.has(rowN.specChoice as string)
      ? MIN_SPEC_CLASS_ONLY
      : rowN.specChoice;

  const handleClassChange = (classId: string) => {
    const specs = getClassSpecs(classId);
    let nextSpec = rowN.specChoice;
    if (nextSpec !== MIN_SPEC_CLASS_ONLY && !specs.some((s) => s.id === nextSpec)) {
      nextSpec = MIN_SPEC_CLASS_ONLY;
    }
    onChange({
      ...rowN,
      classId,
      specChoice: nextSpec,
      legacyDisplayKey: undefined,
    });
  };

  const handleSpecChoiceChange = (v: string) => {
    if (v === MIN_SPEC_CLASS_ONLY) {
      onChange({ ...rowN, specChoice: MIN_SPEC_CLASS_ONLY, legacyDisplayKey: undefined });
    } else {
      onChange({ ...rowN, specChoice: v, legacyDisplayKey: undefined });
    }
  };

  const preview =
    rowN.legacyDisplayKey ? (
      <ClassIcon classId={rowN.classId} size={28} title={rowN.legacyDisplayKey} />
    ) : selectValue === MIN_SPEC_CLASS_ONLY ? (
      <ClassIcon classId={rowN.classId} size={28} />
    ) : (
      <SpecIcon spec={getSpecDisplayName(rowN.classId, selectValue)} size={28} />
    );

  const wrapClass =
    variant === 'wizard'
      ? 'flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/15 px-3 py-3 shadow-sm'
      : 'flex flex-wrap gap-3 items-center rounded-lg border border-border bg-muted/15 px-3 py-2 shadow-sm';

  const countClass =
    countInputClassName ??
    (variant === 'wizard'
      ? 'w-16 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-center'
      : 'w-20 rounded-md border border-input bg-background px-2 py-1 text-sm');

  return (
    <div className="space-y-1">
      <div className={wrapClass}>
        {preview}
        <label className="flex flex-col gap-0.5 min-w-[7rem]">
          <span className="text-xs text-muted-foreground">{t('minSpecClassLabel')}</span>
          <select
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm min-w-[7.5rem]"
            value={rowN.classId}
            onChange={(e) => handleClassChange(e.target.value)}
            aria-label={t('minSpecClassLabel')}
          >
            {TBC_CLASS_IDS.map((cid) => (
              <option key={cid} value={cid}>
                {tProfile(CLASS_I18N_KEYS[cid as keyof typeof CLASS_I18N_KEYS])}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-0.5 min-w-0 flex-1">
          <span className="text-xs text-muted-foreground">{t('minSpecSpecLabel')}</span>
          <select
            className="min-w-[10rem] flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            value={selectValue}
            onChange={(e) => handleSpecChoiceChange(e.target.value)}
            aria-label={t('minSpecSpecLabel')}
          >
            <option value={MIN_SPEC_CLASS_ONLY}>{t('minSpecClassOnly')}</option>
            {classSpecs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <input
          type="number"
          min={countMin}
          max={countMax}
          className={countClass}
          value={rowN.count}
          onChange={(e) => onChange({ ...rowN, count: Number(e.target.value) })}
          aria-label={t('minSpecCountLabel')}
        />
        <button
          type="button"
          className={
            variant === 'wizard'
              ? 'text-sm text-destructive hover:underline shrink-0'
              : 'text-xs text-destructive'
          }
          onClick={onRemove}
        >
          {removeLabel}
        </button>
      </div>
      {rowN.legacyDisplayKey ? (
        <p className="text-xs text-amber-700 dark:text-amber-500 pl-1">
          {t('minSpecLegacyHint', { key: rowN.legacyDisplayKey })}
        </p>
      ) : null}
    </div>
  );
}
