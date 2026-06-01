'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import {
  parseCombatLogFile,
  type CombatLogAnalysis,
  type InstanceSummary,
} from '@/lib/combat-log';
import {
  combatLogDateMatchesRaid,
  formatCombatLogFileDateTime,
  parseCombatLogFileName,
} from '@/lib/combat-log-filename';
import { defaultSelectedInstanceKeys } from '@/lib/combat-log-raid-apply';
import { pickCombatLogFile } from '@/lib/combat-log-file-prefs';

export type CombatLogApplyPayload = {
  file: File;
  analysis: CombatLogAnalysis;
  selectedInstances: InstanceSummary[];
};

type Step = 'pick' | 'review';

export function CombatLogPickerOverlay({
  open,
  onClose,
  userId,
  raidScheduledAtIso,
  raidScheduledEndAtIso,
  dungeonLabel,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  raidScheduledAtIso: string;
  raidScheduledEndAtIso: string | null;
  dungeonLabel: string;
  onApply: (payload: CombatLogApplyPayload) => void;
}) {
  const t = useTranslations('raidComplete');
  const locale = useLocale();
  const [step, setStep] = useState<Step>('pick');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<CombatLogAnalysis | null>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [logDateLabel, setLogDateLabel] = useState<string | null>(null);
  const [dateMismatch, setDateMismatch] = useState(false);

  const reset = useCallback(() => {
    setStep('pick');
    setBusy(false);
    setError(null);
    setFile(null);
    setAnalysis(null);
    setSelectedKeys(new Set());
    setLogDateLabel(null);
    setDateMismatch(false);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  const loadFile = useCallback(
    async (picked: File) => {
      setBusy(true);
      setError(null);
      try {
        const parsed = parseCombatLogFileName(picked.name);
        const dateCheck = combatLogDateMatchesRaid(
          picked.name,
          raidScheduledAtIso,
          raidScheduledEndAtIso
        );

        if (!parsed) {
          setError(t('combatLogDateUnknown'));
          return;
        }

        setLogDateLabel(formatCombatLogFileDateTime(parsed.date, locale));
        setDateMismatch(!dateCheck.ok);

        const result = await parseCombatLogFile(picked, { fileName: picked.name });
        if (result.instances.length === 0) {
          setError(t('combatLogNoInstance'));
          return;
        }

        const defaults = defaultSelectedInstanceKeys(result, dungeonLabel);
        setFile(picked);
        setAnalysis(result);
        setSelectedKeys(defaults);
        setStep('review');
      } catch (e) {
        setError(e instanceof Error ? e.message : t('combatLogApplyError'));
      } finally {
        setBusy(false);
      }
    },
    [dungeonLabel, locale, raidScheduledAtIso, raidScheduledEndAtIso, t]
  );

  const chooseFile = useCallback(async () => {
    setError(null);
    const picked = await pickCombatLogFile(userId);
    if (picked) await loadFile(picked);
  }, [userId, loadFile]);

  const toggleInstance = useCallback((instanceKey: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(instanceKey)) next.delete(instanceKey);
      else next.add(instanceKey);
      return next;
    });
  }, []);

  const confirmApply = useCallback(() => {
    if (!file || !analysis || selectedKeys.size === 0) return;
    const selectedInstances = analysis.instances.filter((i) =>
      selectedKeys.has(i.instanceKey)
    );
    if (selectedInstances.every((i) => i.totalEncounters === 0)) {
      setError(t('combatLogNoInstance'));
      return;
    }
    onApply({ file, analysis, selectedInstances });
    handleClose();
  }, [analysis, file, handleClose, onApply, selectedKeys, t]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1200]">
      <div
        className="absolute inset-0 bg-black/50"
        onMouseDown={handleClose}
        role="button"
        tabIndex={0}
        aria-label="Close"
      />
      <div className="absolute inset-0 flex items-start justify-center p-4 sm:p-6 overflow-y-auto">
        <div
          className="w-full max-w-lg rounded-xl border border-border bg-background shadow-xl overflow-hidden my-auto"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="border-b border-border bg-muted/20 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-foreground">
              {step === 'pick' ? t('combatLogTitle') : t('combatLogReviewTitle')}
            </p>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-muted shrink-0"
              onClick={handleClose}
              aria-label={t('combatLogCancel')}
            >
              ✕
            </button>
          </div>

          <div className="p-4 space-y-4">
            {step === 'pick' ? (
              <>
                {error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}
                <div className="flex flex-col sm:flex-row gap-2 justify-end">
                  <button
                    type="button"
                    className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                    onClick={handleClose}
                    disabled={busy}
                  >
                    {t('combatLogCancel')}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    className={cn(
                      'rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground',
                      busy && 'opacity-50'
                    )}
                    onClick={() => void chooseFile()}
                  >
                    {busy ? t('combatLogParsing') : t('combatLogChooseFile')}
                  </button>
                </div>
              </>
            ) : (
              <>
                {file ? (
                  <p className="text-xs text-muted-foreground truncate" title={file.name}>
                    {file.name}
                  </p>
                ) : null}

                {logDateLabel ? (
                  <div className="rounded-lg border border-border bg-muted/10 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">{t('combatLogLogDate')}: </span>
                    <span className="font-medium tabular-nums">{logDateLabel}</span>
                    {dateMismatch ? (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        {t('combatLogDateMismatch')}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div>
                  <p className="text-xs font-medium text-foreground mb-2">
                    {t('combatLogInstancesLabel')}
                  </p>
                  <ul className="space-y-2 max-h-56 overflow-y-auto rounded-lg border border-border divide-y divide-border">
                    {analysis?.instances.map((inst) => {
                      const checked = selectedKeys.has(inst.instanceKey);
                      return (
                        <li key={inst.instanceKey}>
                          <label className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30">
                            <input
                              type="checkbox"
                              className="mt-0.5 shrink-0"
                              checked={checked}
                              onChange={() => toggleInstance(inst.instanceKey)}
                            />
                            <span className="min-w-0 text-sm">
                              <span className="font-medium text-foreground">
                                {inst.instanceName}
                              </span>
                              <span className="block text-xs text-muted-foreground mt-0.5">
                                {t('combatLogInstanceMeta', {
                                  encounters: inst.totalEncounters,
                                  players: inst.players.length,
                                })}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  {selectedKeys.size === 0 ? (
                    <p className="text-xs text-destructive mt-2">{t('combatLogSelectOne')}</p>
                  ) : null}
                </div>

                {error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}

                <div className="flex flex-col sm:flex-row gap-2 justify-end">
                  <button
                    type="button"
                    className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                    onClick={handleClose}
                    disabled={busy}
                  >
                    {t('combatLogCancel')}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                    disabled={busy}
                    onClick={() => {
                      setStep('pick');
                      setFile(null);
                      setAnalysis(null);
                      setError(null);
                      void chooseFile();
                    }}
                  >
                    {t('combatLogOtherFile')}
                  </button>
                  <button
                    type="button"
                    disabled={busy || selectedKeys.size === 0}
                    className={cn(
                      'rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground',
                      (busy || selectedKeys.size === 0) && 'opacity-50 cursor-not-allowed'
                    )}
                    onClick={confirmApply}
                  >
                    {t('combatLogConfirmApply')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
