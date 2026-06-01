'use client';

import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { combatLogDateMatchesRaid } from '@/lib/combat-log-filename';
import {
  getCombatLogFileMeta,
  openStoredCombatLogFile,
  pickCombatLogFile,
  supportsCombatLogFilePicker,
} from '@/lib/combat-log-file-prefs';

export function CombatLogPickerOverlay({
  open,
  onClose,
  userId,
  raidScheduledAtIso,
  raidScheduledEndAtIso,
  onFileChosen,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  raidScheduledAtIso: string;
  raidScheduledEndAtIso: string | null;
  onFileChosen: (file: File) => void;
}) {
  const t = useTranslations('raidComplete');
  const [storedName, setStoredName] = useState<string | null>(null);
  const [dateWarning, setDateWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const meta = getCombatLogFileMeta(userId);
    setStoredName(meta?.fileName ?? null);
    setDateWarning(null);
  }, [open, userId]);

  const validateAndEmit = useCallback(
    (file: File) => {
      const check = combatLogDateMatchesRaid(
        file.name,
        raidScheduledAtIso,
        raidScheduledEndAtIso
      );
      if (!check.logDate) {
        setDateWarning(t('combatLogDateUnknown'));
        return;
      }
      if (!check.ok) {
        setDateWarning(t('combatLogDateMismatch'));
        return;
      }
      setDateWarning(null);
      onFileChosen(file);
      onClose();
    },
    [onClose, onFileChosen, raidScheduledAtIso, raidScheduledEndAtIso, t]
  );

  const chooseNew = useCallback(async () => {
    setBusy(true);
    setDateWarning(null);
    try {
      const file = await pickCombatLogFile(userId);
      if (file) {
        setStoredName(file.name);
        validateAndEmit(file);
      }
    } finally {
      setBusy(false);
    }
  }, [userId, validateAndEmit]);

  const useStored = useCallback(async () => {
    setBusy(true);
    setDateWarning(null);
    try {
      let file = await openStoredCombatLogFile(userId);
      if (!file) {
        file = await pickCombatLogFile(userId);
      }
      if (file) {
        setStoredName(file.name);
        validateAndEmit(file);
      }
    } finally {
      setBusy(false);
    }
  }, [userId, validateAndEmit]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[1200]">
      <div
        className="absolute inset-0 bg-black/50"
        onMouseDown={() => onClose()}
        role="button"
        tabIndex={0}
        aria-label="Close"
      />
      <div className="absolute inset-0 flex items-start justify-center p-4 sm:p-6">
        <div
          className="w-full max-w-lg rounded-xl border border-border bg-background shadow-xl overflow-hidden"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="border-b border-border bg-muted/20 px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{t('combatLogTitle')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('combatLogHint')}</p>
            </div>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background hover:bg-muted shrink-0"
              onClick={onClose}
              aria-label={t('combatLogCancel')}
            >
              ✕
            </button>
          </div>

          <div className="p-4 space-y-4">
            {storedName ? (
              <p className="text-sm text-foreground">
                {t('combatLogLastFile')}: <code className="text-xs bg-muted px-1 py-0.5 rounded">{storedName}</code>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t('combatLogNoStored')}</p>
            )}

            {supportsCombatLogFilePicker() ? (
              <p className="text-xs text-muted-foreground">{t('combatLogPathRemembered')}</p>
            ) : null}

            {dateWarning ? (
              <p className="text-sm text-destructive" role="alert">
                {dateWarning}
              </p>
            ) : null}

            <div className="flex flex-col sm:flex-row gap-2 justify-end">
              <button
                type="button"
                className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
                onClick={onClose}
                disabled={busy}
              >
                {t('combatLogCancel')}
              </button>
              {storedName ? (
                <button
                  type="button"
                  disabled={busy}
                  className={cn(
                    'rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium',
                    busy && 'opacity-50'
                  )}
                  onClick={() => void useStored()}
                >
                  {busy ? '…' : t('combatLogUseStored')}
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                className={cn(
                  'rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground',
                  busy && 'opacity-50'
                )}
                onClick={() => void chooseNew()}
              >
                {busy ? '…' : t('combatLogChooseFile')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
