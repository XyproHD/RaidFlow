'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BMC_BUTTON_SCRIPT,
  BMC_SLUG,
  BMC_URL,
  BMC_WIDGET_TEXT,
  COFFEE_FAB_LABEL,
  KOFI_PAGE_ID,
  KOFI_URL,
  KOFI_WIDGET_COLOR,
  KOFI_WIDGET_LABEL,
} from '@/lib/support-links';

const POP_MS = 320;

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

function CoffeeCupIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M4 8h12v7a3 3 0 01-3 3H7a3 3 0 01-3-3V8zm14 1h1.2a2.8 2.8 0 110 5.6H18V9zM7 4h2v2H7V4zm4 0h2v2h-2V4zm4 0h2v2h-2V4z" />
    </svg>
  );
}

function injectBmcButton(host: HTMLElement) {
  host.innerHTML = '';
  const script = document.createElement('script');
  script.type = 'text/javascript';
  script.src = BMC_BUTTON_SCRIPT;
  script.setAttribute('data-name', 'bmc-button');
  script.setAttribute('data-slug', BMC_SLUG);
  script.setAttribute('data-color', '#FFDD00');
  script.setAttribute('data-emoji', '☕');
  script.setAttribute('data-font', 'Cookie');
  script.setAttribute('data-text', BMC_WIDGET_TEXT);
  script.setAttribute('data-outline-color', '#000000');
  script.setAttribute('data-font-color', '#000000');
  script.setAttribute('data-coffee-color', '#ffffff');
  host.appendChild(script);
}

export function KofiFab() {
  const rootRef = useRef<HTMLElement>(null);
  const kofiHostRef = useRef<HTMLDivElement>(null);
  const bmcHostRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [popping, setPopping] = useState(false);

  const injectKofi = useCallback(() => {
    const host = kofiHostRef.current;
    const widget = window.kofiwidget2;
    if (!host || !widget) return;
    widget.init(KOFI_WIDGET_LABEL, KOFI_WIDGET_COLOR, KOFI_PAGE_ID);
    host.innerHTML = widget.getHTML();
  }, []);

  const collapse = useCallback(() => {
    setExpanded(false);
    setPopping(false);
    if (kofiHostRef.current) kofiHostRef.current.innerHTML = '';
    if (bmcHostRef.current) bmcHostRef.current.innerHTML = '';
  }, []);

  const expand = useCallback(() => {
    if (expanded || popping) return;
    setPopping(true);
    window.setTimeout(() => {
      setPopping(false);
      setExpanded(true);
    }, POP_MS);
  }, [expanded, popping]);

  useEffect(() => {
    if (!expanded) return;
    injectKofi();
    const bmcHost = bmcHostRef.current;
    if (bmcHost) injectBmcButton(bmcHost);
  }, [expanded, injectKofi]);

  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(event.target as Node)) {
        collapse();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [expanded, collapse]);

  const showMain = !expanded && !popping;

  return (
    <>
      <Script
        src="https://storage.ko-fi.com/cdn/widget/Widget_2.js"
        strategy="afterInteractive"
        onLoad={injectKofi}
      />
      <aside
        ref={rootRef}
        className={`rf-coffee-fab fixed bottom-5 left-5 z-[69]${expanded ? ' rf-coffee-fab--open' : ''}`}
        aria-label={COFFEE_FAB_LABEL}
        onMouseLeave={() => {
          if (expanded) collapse();
        }}
      >
        {showMain ? (
          <button
            type="button"
            onClick={expand}
            className="rf-coffee-fab-main inline-flex min-h-12 min-w-[168px] items-center justify-center gap-2 rounded-full border border-[#5a8fd4]/40 bg-[#72a4f2] px-5 text-sm font-bold text-white shadow-lg transition-shadow hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#72a4f2] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <CoffeeCupIcon className="h-5 w-5 shrink-0" />
            <span>{COFFEE_FAB_LABEL}</span>
          </button>
        ) : null}

        {popping ? (
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="rf-coffee-fab-main rf-coffee-fab-main--popping pointer-events-none inline-flex min-h-12 min-w-[168px] items-center justify-center gap-2 rounded-full border border-[#5a8fd4]/40 bg-[#72a4f2] px-5 text-sm font-bold text-white shadow-lg"
          >
            <CoffeeCupIcon className="h-5 w-5 shrink-0" />
            <span>{COFFEE_FAB_LABEL}</span>
          </button>
        ) : null}

        {expanded ? (
          <div className="rf-coffee-fab-expanded flex flex-col items-start gap-2">
            <div ref={kofiHostRef} />
            <div ref={bmcHostRef} className="rf-coffee-fab-bmc" />
          </div>
        ) : null}

        <noscript>
          <div className="flex flex-col gap-2">
            <a
              href={KOFI_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 min-w-[168px] items-center justify-center rounded-lg bg-[#72a4f2] px-5 text-sm font-bold text-white no-underline"
            >
              {KOFI_WIDGET_LABEL}
            </a>
            <a
              href={BMC_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 min-w-[168px] items-center justify-center rounded-lg bg-[#FFDD00] px-5 text-sm font-bold text-black no-underline"
            >
              {BMC_WIDGET_TEXT}
            </a>
          </div>
        </noscript>
      </aside>
    </>
  );
}
