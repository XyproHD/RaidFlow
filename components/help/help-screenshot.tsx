'use client';

import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

type HelpScreenshotProps = {
  src: string;
  alt: string;
  className?: string;
  zoomLabel: string;
};

export function HelpScreenshot({ src, alt, className, zoomLabel }: HelpScreenshotProps) {
  const [open, setOpen] = useState(false);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'group relative shrink-0 rounded-lg border border-border bg-card p-1.5 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className
        )}
        aria-label={zoomLabel}
      >
        <Image
          src={src}
          alt={alt}
          width={640}
          height={360}
          className="h-auto w-full max-w-[220px] rounded-md"
          sizes="220px"
        />
        <span className="pointer-events-none absolute inset-x-1.5 bottom-1.5 rounded-b-md bg-background/80 px-2 py-1 text-[10px] font-medium text-muted-foreground opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
          {zoomLabel}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            className="absolute right-4 top-4 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-accent"
          >
            ×
          </button>
          <div
            className="max-h-[90vh] max-w-5xl overflow-auto rounded-xl border border-border bg-card p-2 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <Image
              src={src}
              alt={alt}
              width={1280}
              height={720}
              className="h-auto w-full max-h-[85vh] object-contain"
              sizes="(max-width: 1024px) 100vw, 1024px"
            />
          </div>
        </div>
      )}
    </>
  );
}
