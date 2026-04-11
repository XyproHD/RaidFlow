'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { sanitizePlannerLeaderHtml } from '@/lib/sanitize-planner-html';

/** Same typography as the editor: lists, paragraphs, inline format from contentEditable. */
const RICH_HTML_VIEW =
  'text-sm text-foreground [&_p]:mb-2 [&_p:last-child]:mb-0 [&_div]:mb-1 [&_div:last-child]:mb-0' +
  ' [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-0.5' +
  ' [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-0.5' +
  ' [&_li]:pl-0.5' +
  ' [&_b]:font-semibold [&_strong]:font-semibold [&_i]:italic [&_em]:italic [&_u]:underline' +
  ' [&_a]:text-primary [&_a]:underline';

function htmlHasVisibleText(html: string): boolean {
  const safe = sanitizePlannerLeaderHtml(html || '');
  if (typeof document === 'undefined') {
    return safe.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length > 0;
  }
  const tmp = document.createElement('div');
  tmp.innerHTML = safe;
  return (tmp.textContent || '').trim().length > 0;
}

export function PlannerLeaderNotesCollapsible({
  bootstrapKey,
  bootstrapHtml,
  bodyHtmlForPreview,
  expanded,
  onExpandedChange,
  onHtmlChange,
  disabled,
  labels,
}: {
  bootstrapKey: number;
  bootstrapHtml: string;
  bodyHtmlForPreview: string;
  expanded: boolean;
  onExpandedChange: (v: boolean) => void;
  onHtmlChange: (html: string) => void;
  disabled?: boolean;
  labels: {
    title: string;
    expand: string;
    collapse: string;
    bold: string;
    italic: string;
    underline: string;
    bullets: string;
    hint: string;
  };
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const wasExpandedRef = useRef(false);
  const lastAppliedBootstrapKeyRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!expanded) {
      wasExpandedRef.current = false;
      return;
    }
    const el = editorRef.current;
    if (!el) return;

    const openedNow = !wasExpandedRef.current;
    wasExpandedRef.current = true;
    const keyBumped = lastAppliedBootstrapKeyRef.current !== bootstrapKey;

    if (openedNow || keyBumped) {
      el.innerHTML = sanitizePlannerLeaderHtml(bootstrapHtml || '');
      lastAppliedBootstrapKeyRef.current = bootstrapKey;
    }
  }, [expanded, bootstrapKey, bootstrapHtml]);

  const exec = useCallback(
    (command: string, value?: string) => {
      const el = editorRef.current;
      if (!el) return;
      el.focus();
      try {
        document.execCommand(command, false, value);
      } catch {
        /* ignore */
      }
      onHtmlChange(sanitizePlannerLeaderHtml(el.innerHTML));
    },
    [onHtmlChange]
  );

  const onInput = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    onHtmlChange(sanitizePlannerLeaderHtml(el.innerHTML));
  }, [onHtmlChange]);

  const showCollapsedPreview = !expanded && htmlHasVisibleText(bodyHtmlForPreview);
  const previewHtml = sanitizePlannerLeaderHtml(bodyHtmlForPreview);

  return (
    <section
      className={cn(
        'rounded-xl border border-border bg-card/40 shadow-sm overflow-hidden transition-opacity duration-200',
        disabled && 'opacity-60 pointer-events-none'
      )}
    >
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3 text-left hover:bg-muted/30"
        onClick={() => onExpandedChange(!expanded)}
        aria-expanded={expanded}
      >
        <span className="text-sm font-semibold text-foreground">{labels.title}</span>
        <span className="text-xs text-muted-foreground shrink-0">
          {expanded ? labels.collapse : labels.expand}
          <span className="ml-1 tabular-nums">{expanded ? '▾' : '▸'}</span>
        </span>
      </button>
      {showCollapsedPreview ? (
        <div
          className={cn(
            'px-4 py-3 max-h-40 overflow-y-auto border-t border-border/60 bg-muted/10',
            RICH_HTML_VIEW
          )}
          // eslint-disable-next-line react/no-danger -- sanitized guild-internal HTML
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      ) : null}
      {expanded ? (
        <div className="p-3 space-y-2">
          <p className="text-xs text-muted-foreground">{labels.hint}</p>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className="rounded border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec('bold')}
            >
              {labels.bold}
            </button>
            <button
              type="button"
              className="rounded border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted italic"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec('italic')}
            >
              {labels.italic}
            </button>
            <button
              type="button"
              className="rounded border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted underline"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec('underline')}
            >
              {labels.underline}
            </button>
            <button
              type="button"
              className="rounded border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-muted"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec('insertUnorderedList')}
            >
              {labels.bullets}
            </button>
          </div>
          <div
            ref={editorRef}
            className={cn(
              'min-h-[8rem] max-h-[min(40vh,320px)] overflow-y-auto rounded-md border border-input bg-background px-3 py-2',
              RICH_HTML_VIEW,
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            )}
            contentEditable={!disabled}
            suppressContentEditableWarning
            onInput={onInput}
          />
        </div>
      ) : null}
    </section>
  );
}
