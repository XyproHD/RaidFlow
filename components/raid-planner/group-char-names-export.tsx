'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type ExportFormat = 'list' | 'comma' | 'semicolon';

function buildExportText(names: string[], format: ExportFormat): string {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (format === 'list') return cleaned.join('\n');
  if (format === 'comma') return cleaned.join(', ');
  return cleaned.join('; ');
}

function IconLines(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={props.className} aria-hidden>
      <path strokeLinecap="round" d="M6 8h12M6 12h12M6 16h8" />
    </svg>
  );
}

function IconClipboard(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
    </svg>
  );
}

function IconCheck(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className={props.className} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function GroupCharNamesExport({ names }: { names: string[] }) {
  const t = useTranslations('raidRosterPlanner');
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<ExportFormat>('list');
  const [copied, setCopied] = useState(false);

  const text = useMemo(() => buildExportText(names, format), [names, format]);
  const empty = names.length === 0;

  useEffect(() => {
    if (open) {
      setFormat('list');
      setCopied(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const copy = useCallback(async () => {
    if (empty) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      } catch {
        /* ignore */
      }
    }
  }, [empty, text]);

  return (
    <>
      <button
        type="button"
        disabled={empty}
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors',
          empty
            ? 'cursor-not-allowed opacity-40'
            : 'hover:border-border hover:bg-muted/50 hover:text-foreground'
        )}
        aria-label={t('exportNamesOpen')}
        title={empty ? t('exportNamesEmpty') : t('exportNamesOpen')}
      >
        <IconClipboard className="h-3.5 w-3.5" />
      </button>

      {open
        ? createPortal(
            <div className="fixed inset-0 z-[1190] flex items-center justify-center p-4">
              <button
                type="button"
                className="absolute inset-0 bg-black/35 backdrop-blur-[1px]"
                aria-label={t('closeOverlay')}
                onClick={() => setOpen(false)}
              />
              <div
                className="relative w-full max-w-[min(100%,280px)] rounded-lg border border-border/80 bg-background/95 p-2.5 shadow-lg backdrop-blur-sm"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="flex items-stretch gap-1.5">
                  <div
                    className="flex min-w-0 flex-1 rounded-md border border-border/70 bg-muted/20 p-0.5"
                    role="group"
                    aria-label={t('exportNamesFormatGroup')}
                  >
                    <button
                      type="button"
                      title={t('exportNamesFormatList')}
                      aria-label={t('exportNamesFormatList')}
                      aria-pressed={format === 'list'}
                      onClick={() => setFormat('list')}
                      className={cn(
                        'flex flex-1 items-center justify-center rounded px-1 py-1 transition-colors',
                        format === 'list'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <IconLines className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title={t('exportNamesFormatComma')}
                      aria-label={t('exportNamesFormatComma')}
                      aria-pressed={format === 'comma'}
                      onClick={() => setFormat('comma')}
                      className={cn(
                        'flex flex-1 items-center justify-center rounded px-1 py-1 font-mono text-sm leading-none transition-colors',
                        format === 'comma'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      ,
                    </button>
                    <button
                      type="button"
                      title={t('exportNamesFormatSemicolon')}
                      aria-label={t('exportNamesFormatSemicolon')}
                      aria-pressed={format === 'semicolon'}
                      onClick={() => setFormat('semicolon')}
                      className={cn(
                        'flex flex-1 items-center justify-center rounded px-1 py-1 font-mono text-sm leading-none transition-colors',
                        format === 'semicolon'
                          ? 'bg-background text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      ;
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={empty}
                    onClick={() => void copy()}
                    className={cn(
                      'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition-colors',
                      copied
                        ? 'border-green-600/40 bg-green-500/10 text-green-600 dark:text-green-400'
                        : 'border-border/70 bg-muted/15 text-muted-foreground hover:bg-muted/40 hover:text-foreground',
                      empty && 'cursor-not-allowed opacity-40'
                    )}
                    aria-label={t('exportNamesCopy')}
                    title={t('exportNamesCopy')}
                  >
                    {copied ? <IconCheck className="h-4 w-4" /> : <IconClipboard className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
