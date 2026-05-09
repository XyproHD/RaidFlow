'use client';

import Script from 'next/script';
import { useCallback, useEffect, useRef } from 'react';
import {
  BUYMEACOFFEE_SLUG,
  BUYMEACOFFEE_URL,
} from '@/lib/support-links';

declare global {
  interface Window {
    /**
     * von button.prod.min.js — nur nutzen ohne `script[data-name="bmc-button"]`,
     * sonst würde das Script beim Parsen document.writeln aufrufen.
     */
    bmcBtnWidget?: (
      text: string,
      slug: string,
      color: string,
      emoji: string,
      font: string,
      fontColor?: string,
      outlineColor?: string,
      coffeeColor?: string,
    ) => string;
  }
}

/** Farben/Text wie gewünschtes BMC-Snippet (data-*). */
const BMC_TEXT = 'Spendiere einen Kaffee';
const BMC_BG = '#FFDD00';
const BMC_FONT = 'Cookie';
const BMC_FONT_COLOR = '#000000';
const BMC_OUTLINE_COLOR = '#000000';
const BMC_COFFEE_COLOR = '#ffffff';

export function BuymeacoffeeFab() {
  const hostRef = useRef<HTMLDivElement>(null);

  const injectWidget = useCallback(() => {
    const host = hostRef.current;
    const maker = window.bmcBtnWidget;
    if (!host || !maker) return;
    const html = maker(
      BMC_TEXT,
      BUYMEACOFFEE_SLUG,
      BMC_BG,
      '',
      BMC_FONT,
      BMC_FONT_COLOR,
      BMC_OUTLINE_COLOR,
      BMC_COFFEE_COLOR,
    );
    host.innerHTML = html;
  }, []);

  useEffect(() => {
    injectWidget();
  }, [injectWidget]);

  return (
    <>
      {/*
        Kein data-name="bmc-button": sonst document.writeln und Next.js/App würden zerstört.
      */}
      <Script
        src="https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js"
        strategy="afterInteractive"
        onLoad={injectWidget}
      />
      <aside
        className="rf-bmc-fab fixed bottom-5 left-5 z-[69]"
        aria-label={BMC_TEXT}
      >
        <div ref={hostRef} />
        <noscript>
          <a
            href={BUYMEACOFFEE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 min-w-[168px] items-center justify-center rounded-xl bg-[#FFDD00] px-5 font-serif text-lg text-black no-underline"
          >
            {BMC_TEXT}
          </a>
        </noscript>
      </aside>
    </>
  );
}
