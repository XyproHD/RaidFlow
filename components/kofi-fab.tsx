'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef } from 'react';
import {
  KOFI_PAGE_ID,
  KOFI_URL,
  KOFI_WIDGET_COLOR,
  KOFI_WIDGET_LABEL,
} from '@/lib/support-links';

declare global {
  interface Window {
    /**
     * Ko-fi Widget_2.js — `draw()` nutzt document.writeln; nur `getHTML()` nach `init()`.
     */
    kofiwidget2?: {
      init: (text: string, color: string, id: string) => void;
      getHTML: () => string;
      draw: () => void;
    };
  }
}

export function KofiFab() {
  const hostRef = useRef<HTMLDivElement>(null);

  const injectWidget = useCallback(() => {
    const host = hostRef.current;
    const widget = window.kofiwidget2;
    if (!host || !widget) return;
    widget.init(KOFI_WIDGET_LABEL, KOFI_WIDGET_COLOR, KOFI_PAGE_ID);
    host.innerHTML = widget.getHTML();
  }, []);

  useEffect(() => {
    injectWidget();
  }, [injectWidget]);

  return (
    <>
      <Script
        src="https://storage.ko-fi.com/cdn/widget/Widget_2.js"
        strategy="afterInteractive"
        onLoad={injectWidget}
      />
      <aside
        className="rf-kofi-fab fixed bottom-5 left-5 z-[69]"
        aria-label={KOFI_WIDGET_LABEL}
      >
        <div ref={hostRef} />
        <noscript>
          <a
            href={KOFI_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 min-w-[168px] items-center justify-center rounded-lg bg-[#72a4f2] px-5 text-sm font-bold text-white no-underline"
          >
            {KOFI_WIDGET_LABEL}
          </a>
        </noscript>
      </aside>
    </>
  );
}
