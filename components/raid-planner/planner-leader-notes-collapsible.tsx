'use client';

import { useCallback, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { sanitizePlannerLeaderHtml } from '@/lib/sanitize-planner-html';

function stripTagsForPreview(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const next = sanitizePlannerLeaderHtml(bootstrapHtml || '');
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [bootstrapKey, bootstrapHtml]);

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

  const preview = stripTagsForPreview(bodyHtmlForPreview);
  const previewShort = preview.length > 120 ? `${preview.slice(0, 120)}…` : preview;

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
      {!expanded && previewShort ? (
        <p className="px-4 py-2 text-xs text-muted-foreground line-clamp-2">{previewShort}</p>
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
              'min-h-[8rem] max-h-[min(40vh,320px)] overflow-y-auto rounded-md border border-input bg-background px-3 py-2 text-sm',
              '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-primary [&_a]:underline',
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
