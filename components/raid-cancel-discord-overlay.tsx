'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { RAID_CANCEL_DM_MAX_LENGTH, discordDmContentToPreviewHtml } from '@/lib/raid-cancel-message';

export function RaidCancelDiscordOverlay({
  open,
  defaultMessage,
  onClose,
  onConfirm,
  busy,
  title,
  editorLabel,
  previewLabel,
  resetLabel,
  cancelLabel,
  confirmLabel,
  hintMarkdown,
}: {
  open: boolean;
  defaultMessage: string;
  onClose: () => void;
  onConfirm: (message: string) => void | Promise<void>;
  busy?: boolean;
  title: string;
  editorLabel: string;
  previewLabel: string;
  resetLabel: string;
  cancelLabel: string;
  confirmLabel: string;
  hintMarkdown?: string;
}) {
  const [draft, setDraft] = useState(defaultMessage);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) setDraft(defaultMessage);
  }, [open, defaultMessage]);

  if (!mounted || !open) return null;

  const len = draft.length;
  const over = len > RAID_CANCEL_DM_MAX_LENGTH;

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label={cancelLabel}
        onClick={() => !busy && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="raid-cancel-dm-title"
        className={cn(
          'relative z-[1101] w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col rounded-xl border border-border bg-card shadow-xl'
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <h2 id="raid-cancel-dm-title" className="text-base font-semibold text-foreground">
            {title}
          </h2>
          {hintMarkdown ? <p className="mt-1 text-xs text-muted-foreground">{hintMarkdown}</p> : null}
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 grid gap-4 md:grid-cols-2 min-h-0">
          <div className="flex flex-col gap-2 min-h-0">
            <label htmlFor="raid-cancel-dm-editor" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              {editorLabel}
            </label>
            <textarea
              id="raid-cancel-dm-editor"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={!!busy}
              rows={14}
              className="w-full min-h-[220px] flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 resize-y"
              spellCheck
            />
            <div className="flex items-center justify-between gap-2 text-xs">
              <button
                type="button"
                disabled={!!busy}
                className="text-primary hover:underline disabled:opacity-50"
                onClick={() => setDraft(defaultMessage)}
              >
                {resetLabel}
              </button>
              <span className={cn('tabular-nums text-muted-foreground', over && 'text-destructive font-medium')}>
                {len} / {RAID_CANCEL_DM_MAX_LENGTH}
              </span>
            </div>
          </div>
          <div className="flex flex-col gap-2 min-h-0">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{previewLabel}</span>
            <div
              className="rounded-lg border border-border bg-[#2b2d31] text-[#dbdee1] px-3 py-3 text-sm leading-relaxed min-h-[220px] flex-1 overflow-y-auto shadow-inner"
              style={{ fontFamily: 'gg sans, "Noto Sans", ui-sans-serif, system-ui, sans-serif' }}
            >
              <div dangerouslySetInnerHTML={{ __html: discordDmContentToPreviewHtml(draft) }} />
            </div>
          </div>
        </div>
        <div className="border-t border-border px-4 py-3 sm:px-5 flex flex-wrap justify-end gap-2 bg-muted/20">
          <button
            type="button"
            disabled={!!busy}
            className="rounded-lg border border-border bg-background px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
            onClick={() => !busy && onClose()}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!!busy || over || !draft.trim()}
            className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            onClick={() => void onConfirm(draft.trim())}
          >
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
